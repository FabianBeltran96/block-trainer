import { SDF_INFINITE } from '../input/config';
import { sanitizeSettings, type TrainerSettings } from '../storage/settingsStore';
import { el } from './dom';

export interface SettingsPanelHandlers {
  onApply(settings: TrainerSettings): void;
  onRestart(): void;
}

function numberField(label: string, name: string, value: number, min: number, max: number, hint: string) {
  const input = el('input', { type: 'number', name, min, max, step: 1, value });
  return { input, row: el('label', { class: 'field', title: hint }, [el('span', {}, [label]), input]) };
}

export function createSettingsPanel(container: HTMLElement, initial: TrainerSettings, handlers: SettingsPanelHandlers) {
  const das = numberField('DAS (ms)', 'das', initial.handling.dasMs, 0, 1000, 'Hold time before auto-shift starts');
  const arr = numberField('ARR (ms)', 'arr', initial.handling.arrMs, 0, 500, 'Time between auto-shift moves; 0 = instant');
  const dcd = numberField('DCD (ms)', 'dcd', initial.handling.dcdMs, 0, 500, 'Auto-shift pause after rotate/hold/drop');
  const sdf = numberField(
    `SDF (${SDF_INFINITE} = inf)`,
    'sdf',
    initial.handling.sdf,
    1,
    SDF_INFINITE,
    'Soft drop speed multiplier; 41 drops instantly without locking',
  );
  const gravityOn = el('input', { type: 'checkbox', name: 'gravity', checked: initial.gravity.enabled });
  const gravityRate = numberField('Gravity (rows/s)', 'gravityRate', initial.gravity.rowsPerSecond, 1, 60, 'Fall speed when gravity is on');
  const allow180 = el('input', { type: 'checkbox', name: 'allow180', checked: initial.allow180 });

  const read = (): TrainerSettings =>
    sanitizeSettings({
      handling: {
        dasMs: das.input.valueAsNumber,
        arrMs: arr.input.valueAsNumber,
        dcdMs: dcd.input.valueAsNumber,
        sdf: sdf.input.valueAsNumber,
      },
      gravity: { enabled: gravityOn.checked, rowsPerSecond: gravityRate.input.valueAsNumber },
      allow180: allow180.checked,
    });

  const form = el('form', { class: 'settings' }, [
    das.row,
    arr.row,
    dcd.row,
    sdf.row,
    el('label', { class: 'field check' }, [gravityOn, el('span', {}, ['Gravity'])]),
    gravityRate.row,
    el('label', { class: 'field check', title: 'Count 180 rotation as one input for optimal finesse' }, [
      allow180,
      el('span', {}, ['180 in finesse']),
    ]),
  ]);
  const restart = el('button', { type: 'button', class: 'primary' }, ['Restart (R)']);
  const note = el('p', { class: 'note' }, ['Changes start a new run.']);

  form.addEventListener('change', (event) => {
    const settings = read();
    handlers.onApply(settings);
    if (event.target instanceof HTMLElement) event.target.blur();
  });
  form.addEventListener('submit', (event) => event.preventDefault());
  restart.addEventListener('click', () => {
    restart.blur();
    handlers.onRestart();
  });

  container.replaceChildren(el('h2', {}, ['Handling']), form, restart, note);
}
