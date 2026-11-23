/** How much placement help the sprint board shows. */
export type SprintGuide = 'opener' | 'always' | 'next' | 'recovery' | 'off';

export const SPRINT_GUIDES: readonly { readonly id: SprintGuide; readonly name: string; readonly description: string }[] = [
  { id: 'opener', name: 'Opener (first 6)', description: 'Planned ghost for the first 6 pieces, then you are on your own.' },
  { id: 'always', name: 'Full plan', description: 'Planned ghosts for every visible piece, all run long.' },
  { id: 'next', name: 'Next piece only', description: 'Only the best spot for the current piece, all run long.' },
  {
    id: 'recovery',
    name: 'After mistakes',
    description: 'Hidden while you stack clean; after a hole or a blocked well it shows the best spot for the next piece.',
  },
  { id: 'off', name: 'Off', description: 'No ghost. Well and hole checks still run.' },
];

export const DEFAULT_GUIDE: SprintGuide = 'opener';

export function isSprintGuide(value: unknown): value is SprintGuide {
  return SPRINT_GUIDES.some((g) => g.id === value);
}
