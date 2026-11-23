import { parseReplay, type ReplayData } from '../replay/replay';
import { DEFAULT_GUIDE, isSprintGuide, type SprintGuide } from '../modes/sprint/guide';
import { readJson, writeJson, STORAGE_PREFIX, type KeyValueStorage } from './keyValue';

export const SPRINT_KEY = `${STORAGE_PREFIX}:sprint`;
export const SPRINT_RECENT_LIMIT = 20;

export interface SprintRecord {
  readonly layoutId: string;
  readonly date: string;
  readonly completed: boolean;
  readonly durationMs: number;
  readonly pieces: number;
  readonly lines: number;
  readonly pps: number;
  readonly finessePct: number;
  readonly tetrisPct: number;
  readonly wellViolations: number;
  readonly holes: number;
}

export interface SprintData {
  readonly layoutId: string;
  readonly guide: SprintGuide;
  /** Fastest completed run per layout, with its replay. */
  readonly best: Readonly<Record<string, { readonly record: SprintRecord; readonly replay: ReplayData }>>;
  readonly recent: readonly SprintRecord[];
  readonly last: { readonly record: SprintRecord; readonly replay: ReplayData } | null;
}

export const EMPTY_SPRINT: SprintData = { layoutId: '6-3', guide: DEFAULT_GUIDE, best: {}, recent: [], last: null };

type Raw = Record<string, unknown>;
const asRaw = (v: unknown): Raw => (typeof v === 'object' && v !== null ? (v as Raw) : {});
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function parseRecord(value: unknown): SprintRecord {
  const r = asRaw(value);
  return {
    layoutId: typeof r.layoutId === 'string' ? r.layoutId : '6-3',
    date: typeof r.date === 'string' ? r.date : new Date(0).toISOString(),
    completed: r.completed === true,
    durationMs: num(r.durationMs),
    pieces: num(r.pieces),
    lines: num(r.lines),
    pps: num(r.pps),
    finessePct: num(r.finessePct),
    tetrisPct: num(r.tetrisPct),
    wellViolations: num(r.wellViolations),
    holes: num(r.holes),
  };
}

function parseEntry(value: unknown) {
  const e = asRaw(value);
  return { record: parseRecord(e.record), replay: parseReplay(e.replay) };
}

export function loadSprint(storage: KeyValueStorage): SprintData {
  try {
    const raw = asRaw(readJson(storage, SPRINT_KEY));
    const best: Record<string, ReturnType<typeof parseEntry>> = {};
    for (const [id, entry] of Object.entries(asRaw(raw.best))) {
      try {
        best[id] = parseEntry(entry);
      } catch {
        /* skip corrupted entry */
      }
    }
    let last = null;
    try {
      last = raw.last ? parseEntry(raw.last) : null;
    } catch {
      last = null;
    }
    return {
      layoutId: typeof raw.layoutId === 'string' ? raw.layoutId : EMPTY_SPRINT.layoutId,
      guide: isSprintGuide(raw.guide) ? raw.guide : DEFAULT_GUIDE,
      best,
      recent: Array.isArray(raw.recent) ? raw.recent.map(parseRecord).slice(0, SPRINT_RECENT_LIMIT) : [],
      last,
    };
  } catch {
    return EMPTY_SPRINT;
  }
}

export function saveSprint(storage: KeyValueStorage, data: SprintData): void {
  writeJson(storage, SPRINT_KEY, data);
}

/** Adds a finished run: updates last, recent and (if completed and faster) the layout best. */
export function addSprintRun(data: SprintData, record: SprintRecord, replay: ReplayData): SprintData {
  const current = data.best[record.layoutId];
  const isBest = record.completed && (!current || record.durationMs < current.record.durationMs);
  return {
    ...data,
    best: isBest ? { ...data.best, [record.layoutId]: { record, replay } } : data.best,
    recent: [record, ...data.recent].slice(0, SPRINT_RECENT_LIMIT),
    last: { record, replay },
  };
}
