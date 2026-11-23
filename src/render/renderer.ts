import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  VISIBLE_HEIGHT,
  pieceCells,
  pieceFromId,
  shapeCells,
  type ActivePiece,
  type Cell,
  type EngineSnapshot,
  type PieceType,
} from '../engine';
import { COLORS, PIECE_COLORS } from './palette';

const CELL = 28;
const PREVIEW_CELL = 18;
const BUFFER_ROWS = 2;
const FIRST_ROW = BOARD_HEIGHT - VISIBLE_HEIGHT - BUFFER_ROWS;
const ROWS = VISIBLE_HEIGHT + BUFFER_ROWS;
const SIDE = 120;
const GAP = 16;

const FIELD_X = SIDE + GAP;
const WIDTH = FIELD_X + BOARD_WIDTH * CELL + GAP + SIDE;
const HEIGHT = ROWS * CELL;

/** Draws an engine snapshot onto a canvas. Pure drawing, no DOM outside the canvas. */
/** Optional training overlay: a marked well column and cells to flag. */
export interface BoardGuide {
  readonly wellColumn: number | null;
  readonly highlight: readonly Cell[];
  /** Ghost targets drawn on the board in order; the first one is the active piece's target. */
  readonly plan?: readonly {
    readonly type: PieceType;
    readonly cells: readonly Cell[];
    readonly viaHold: boolean;
    readonly maneuver?: string;
  }[];
}

const NO_GUIDE: BoardGuide = { wellColumn: null, highlight: [] };

export class CanvasRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private guide: BoardGuide = NO_GUIDE;

  setGuide(guide: BoardGuide | null): void {
    this.guide = guide ?? NO_GUIDE;
  }

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
    this.resize();
  }

  resize(): void {
    // At least 2x backing resolution: the layout scales the canvas up to fit the viewport.
    const ratio = Math.max(2, globalThis.devicePixelRatio || 1);
    this.canvas.width = WIDTH * ratio;
    this.canvas.height = HEIGHT * ratio;
    this.canvas.style.width = `${WIDTH}px`;
    this.canvas.style.aspectRatio = `${WIDTH} / ${HEIGHT}`;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  draw(snapshot: EngineSnapshot): void {
    const ctx = this.ctx;
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    this.drawField(snapshot);
    this.drawPanel('HOLD', 0, snapshot.hold ? [snapshot.hold] : [], snapshot.holdUsed);
    this.drawPanel('NEXT', FIELD_X + BOARD_WIDTH * CELL + GAP, snapshot.next, false);
    if (snapshot.gameOver) this.drawOverlay('Topped out. Press R');
  }

  private drawField(snapshot: EngineSnapshot): void {
    const ctx = this.ctx;
    ctx.fillStyle = COLORS.buffer;
    ctx.fillRect(FIELD_X, 0, BOARD_WIDTH * CELL, BUFFER_ROWS * CELL);
    ctx.fillStyle = COLORS.field;
    ctx.fillRect(FIELD_X, BUFFER_ROWS * CELL, BOARD_WIDTH * CELL, VISIBLE_HEIGHT * CELL);

    const well = this.guide.wellColumn;
    if (well !== null) {
      ctx.fillStyle = COLORS.well;
      ctx.fillRect(FIELD_X + well * CELL, BUFFER_ROWS * CELL, CELL, VISIBLE_HEIGHT * CELL);
    }

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < BOARD_WIDTH; x++) {
      ctx.moveTo(FIELD_X + x * CELL + 0.5, BUFFER_ROWS * CELL);
      ctx.lineTo(FIELD_X + x * CELL + 0.5, HEIGHT);
    }
    for (let y = BUFFER_ROWS + 1; y < ROWS; y++) {
      ctx.moveTo(FIELD_X, y * CELL + 0.5);
      ctx.lineTo(FIELD_X + BOARD_WIDTH * CELL, y * CELL + 0.5);
    }
    ctx.stroke();

    for (let y = FIRST_ROW; y < BOARD_HEIGHT; y++) {
      for (let x = 0; x < BOARD_WIDTH; x++) {
        const id = snapshot.board.get(x, y);
        if (id === 0) continue;
        const type = pieceFromId(id);
        this.fillCell(x, y, type ? PIECE_COLORS[type] : COLORS.garbage, 1);
      }
    }

    this.drawPlan();
    if (snapshot.ghost) this.drawPiece(snapshot.ghost, 0.22);
    if (snapshot.active) this.drawPiece(snapshot.active, 1);

    if (this.guide.highlight.length > 0) {
      ctx.strokeStyle = COLORS.issue;
      ctx.lineWidth = 3;
      for (const [x, y] of this.guide.highlight) {
        if (y < FIRST_ROW) continue;
        ctx.strokeRect(FIELD_X + x * CELL + 2.5, (y - FIRST_ROW) * CELL + 2.5, CELL - 5, CELL - 5);
      }
    }

    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 2;
    ctx.strokeRect(FIELD_X - 1, BUFFER_ROWS * CELL - 1, BOARD_WIDTH * CELL + 2, VISIBLE_HEIGHT * CELL + 2);
  }

  private drawPiece(piece: ActivePiece, alpha: number): void {
    for (const [x, y] of pieceCells(piece)) {
      if (y >= FIRST_ROW) this.fillCell(x, y, PIECE_COLORS[piece.type], alpha);
    }
  }

  private drawPlan(): void {
    const plan = this.guide.plan;
    if (!plan || plan.length === 0) return;
    const ctx = this.ctx;
    ctx.save();
    plan.forEach(({ type, cells, viaHold, maneuver }, index) => {
      const current = index === 0;
      for (const [x, y] of cells) {
        if (y < FIRST_ROW) continue;
        this.fillCell(x, y, PIECE_COLORS[type], current ? 0.35 : 0.14);
        ctx.strokeStyle = PIECE_COLORS[type];
        ctx.globalAlpha = current ? 0.95 : 0.45;
        ctx.lineWidth = current ? 2 : 1;
        ctx.setLineDash(current ? [] : [3, 3]);
        ctx.strokeRect(FIELD_X + x * CELL + 1.5, (y - FIRST_ROW) * CELL + 1.5, CELL - 3, CELL - 3);
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      const [sx, sy] = cells.reduce(([ax, ay], [x, y]) => [ax + x, ay + y], [0, 0]);
      ctx.fillStyle = COLORS.text;
      ctx.globalAlpha = current ? 1 : 0.7;
      ctx.font = `600 ${current ? 15 : 12}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        `${index + 1}${viaHold ? 'H' : ''}${maneuver && maneuver !== 'drop' ? '*' : ''}`,
        FIELD_X + (sx / cells.length + 0.5) * CELL,
        (sy / cells.length - FIRST_ROW + 0.5) * CELL,
      );
      ctx.globalAlpha = 1;
    });
    ctx.restore();
  }

  private fillCell(x: number, y: number, color: string, alpha: number): void {
    const ctx = this.ctx;
    const px = FIELD_X + x * CELL;
    const py = (y - FIRST_ROW) * CELL;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
    ctx.globalAlpha = 1;
  }

  private drawPanel(label: string, left: number, pieces: readonly PieceType[], dimmed: boolean): void {
    const ctx = this.ctx;
    ctx.fillStyle = COLORS.text;
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(label, left + 4, BUFFER_ROWS * CELL);
    const slot = PREVIEW_CELL * 3.4;
    pieces.forEach((type, i) => {
      this.drawPreview(type, left + SIDE / 2, BUFFER_ROWS * CELL + 24 + slot * i + slot / 2, dimmed);
    });
  }

  private drawPreview(type: PieceType, centerX: number, centerY: number, dimmed: boolean): void {
    const cells = shapeCells(type, 0);
    const xs = cells.map(([x]) => x);
    const ys = cells.map(([, y]) => y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const w = Math.max(...xs) - minX + 1;
    const h = Math.max(...ys) - minY + 1;
    const ox = centerX - (w * PREVIEW_CELL) / 2;
    const oy = centerY - (h * PREVIEW_CELL) / 2;
    this.ctx.fillStyle = dimmed ? COLORS.dimmed : PIECE_COLORS[type];
    for (const [x, y] of cells) {
      this.ctx.fillRect(ox + (x - minX) * PREVIEW_CELL + 1, oy + (y - minY) * PREVIEW_CELL + 1, PREVIEW_CELL - 2, PREVIEW_CELL - 2);
    }
  }

  private drawOverlay(text: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(FIELD_X, BUFFER_ROWS * CELL, BOARD_WIDTH * CELL, VISIBLE_HEIGHT * CELL);
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, FIELD_X + (BOARD_WIDTH * CELL) / 2, HEIGHT / 2);
    ctx.textAlign = 'start';
  }
}
