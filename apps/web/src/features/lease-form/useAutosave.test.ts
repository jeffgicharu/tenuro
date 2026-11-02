import { describe, expect, it } from 'vitest';
import { chooseRestore, type LocalCopy } from './useAutosave.ts';
import { validLease } from './test-fixtures.ts';

const copy = (at: number, patch: (d: ReturnType<typeof validLease>) => void = () => {}): LocalCopy => {
  const data = validLease();
  patch(data);
  return { data, step: 'rent', at, draftId: 'TGVhc2VEcmFmdDox', draftVersion: 2, baseVersion: null };
};

describe('chooseRestore', () => {
  const serverAt = '2026-11-02T10:00:00.000Z';
  const later = Date.parse(serverAt) + 5_000;

  // Regression: the browser copy is written just after each server save, so after a plain reload it
  // looked newer and the form announced "restored" changes that were already saved.
  it('ignores a newer browser copy that matches the server', () => {
    expect(chooseRestore(copy(later), validLease(), serverAt)).toBeNull();
  });

  it('restores a newer browser copy that holds unsaved changes', () => {
    const local = copy(later, (d) => { d.notes = 'typed while offline'; });
    expect(chooseRestore(local, validLease(), serverAt)).toBe(local);
  });

  it('ignores an older browser copy', () => {
    expect(chooseRestore(copy(Date.parse(serverAt) - 5_000, (d) => { d.notes = 'old'; }), validLease(), serverAt)).toBeNull();
  });

  it('restores unsaved work when there is no server draft yet', () => {
    const local = copy(1, (d) => { d.notes = 'never reached the server'; });
    expect(chooseRestore(local, validLease(), null)).toBe(local);
  });
});
