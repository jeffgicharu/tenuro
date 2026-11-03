import type { OptionStatus } from '../db/types.ts';

// An option still recorded as open is open only until its last chance to act: the notice deadline,
// or the exercise date when the lease sets no notice. After that, unexercised, it has lapsed. One
// rule for the seed, for saved leases and for what the API reports, so a holding-over lease never
// shows a renewal option as "Open" months after its notice date.
export function optionStatus(stored: OptionStatus, exerciseOn: string, noticeBy: string | null, today: string): OptionStatus {
  if (stored !== 'OPEN') return stored;
  const lastDay = noticeBy ?? exerciseOn;
  return lastDay < today ? 'LAPSED' : 'OPEN';
}
