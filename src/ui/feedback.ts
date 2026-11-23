import type { FinesseVerdict } from '../modes/finesse/verdict';
import { formatVerdict } from '../modes/finesse/verdict';

export function createFeedback(container: HTMLElement): {
  showVerdict(verdict: FinesseVerdict): void;
  showMessage(text: string): void;
  showIssue(text: string): void;
} {
  const set = (text: string, kind: string) => {
    container.textContent = text;
    container.dataset.kind = kind;
  };
  return {
    showVerdict: (verdict) => set(formatVerdict(verdict), verdict.kind),
    showMessage: (text) => set(text, 'info'),
    showIssue: (text) => set(text, 'fault'),
  };
}
