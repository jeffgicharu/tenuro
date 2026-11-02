import { ACCOUNTS, type AccountKey } from './accounts.ts';
import { type Dec, D, fmt, sum, ZERO } from './decimal.ts';
import { rawRows, type RawRow } from './engine.ts';
import type { AccountingStandard, CommencementAmounts, JournalEntry, JournalLine, Schedule } from './types.ts';

/** A posting with a signed amount: positive debits the account, negative credits it. */
export type Posting = readonly [AccountKey, Dec];

export function toLines(postings: readonly Posting[], dp: number): JournalLine[] {
  const total = sum(postings.map(([, amount]) => amount));
  if (!total.isZero()) throw new Error(`Unbalanced journal: postings sum to ${total.toString()}`);
  return postings
    .filter(([, amount]) => !amount.isZero())
    .map(([key, amount]) => ({
      account: ACCOUNTS[key].code,
      accountName: ACCOUNTS[key].name,
      debit: fmt(amount.isPositive() ? amount : ZERO, dp),
      credit: fmt(amount.isNegative() ? amount.neg() : ZERO, dp),
    }));
}

function entry(
  kind: JournalEntry['kind'],
  period: number,
  date: string,
  memo: string,
  postings: readonly Posting[],
  dp: number,
): JournalEntry | null {
  const lines = toLines(postings, dp);
  return lines.length ? { period, date, kind, memo, lines } : null;
}

export function commencementEntry(date: string, c: CommencementAmounts, dp: number): JournalEntry | null {
  const liability = new D(c.liability);
  const paid = new D(c.commencementPayment);
  const idc = new D(c.initialDirectCosts);
  const prepaid = new D(c.prepayments);
  const restoration = new D(c.restoration);
  const incentives = new D(c.incentives);
  return entry(
    'COMMENCEMENT',
    0,
    date,
    'Recognise right-of-use asset and lease liability at commencement',
    [
      ['ROU_ASSET', liability],
      ['LEASE_LIABILITY', liability.neg()],
      ['ROU_ASSET', paid],
      ['CASH', paid.neg()],
      ['ROU_ASSET', idc],
      ['CASH', idc.neg()],
      ['ROU_ASSET', prepaid],
      ['PREPAID_LEASE', prepaid.neg()],
      ['ROU_ASSET', restoration],
      ['RESTORATION_PROVISION', restoration.neg()],
      ['CASH', incentives],
      ['ROU_ASSET', incentives.neg()],
    ],
    dp,
  );
}

/**
 * Every journal entry for a schedule: commencement, each period's interest, payment and
 * depreciation (or operating cost), and any remeasurements, in posting order.
 */
export function scheduleJournals(schedule: Schedule): JournalEntry[] {
  const dp = schedule.minorUnits;
  const exempt = (schedule.input.exemption ?? 'NONE') !== 'NONE';
  const out: JournalEntry[] = [];
  if (!exempt) {
    const opening = commencementEntry(schedule.input.commencementDate, schedule.commencement, dp);
    if (opening) out.push(opening);
  }
  for (const event of schedule.events) if (event.journal) out.push(event.journal);
  for (const row of rawRows(schedule)) out.push(...rowEntries(row, schedule.input.standard, exempt, dp));
  return out.sort(
    (a, b) => a.period - b.period || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind],
  );
}

const KIND_ORDER: Record<JournalEntry['kind'], number> = {
  COMMENCEMENT: 0,
  REMEASUREMENT: 1,
  PAYMENT: 2,
  INTEREST: 3,
  OPERATING_LEASE_COST: 3,
  EXEMPT_LEASE_COST: 3,
  DEPRECIATION: 4,
};

export function rowEntries(row: RawRow, standard: AccountingStandard, exempt: boolean, dp: number): JournalEntry[] {
  const out: Array<JournalEntry | null> = [];
  const p = row.period;
  if (exempt) {
    out.push(
      entry('EXEMPT_LEASE_COST', p, row.endDate, `Lease expense, period ${p}`, [
        ['EXEMPT_LEASE_COST', row.leaseCost],
        ['CASH', row.cashPaid.neg()],
        ['ACCRUED_LEASE', row.cashPaid.minus(row.leaseCost)],
      ], dp),
    );
    return out.filter((e): e is JournalEntry => e !== null);
  }

  out.push(
    entry('PAYMENT', p, row.paymentDate, `Lease payment, period ${p}`, [
      ['LEASE_LIABILITY', row.payment],
      ['CASH', row.payment.neg()],
    ], dp),
  );
  if (standard === 'ASC842_OPERATING') {
    out.push(
      entry('OPERATING_LEASE_COST', p, row.endDate, `Straight-line lease cost, period ${p}`, [
        ['OPERATING_LEASE_COST', row.leaseCost],
        ['LEASE_LIABILITY', row.interest.neg()],
        ['ROU_ACCUMULATED', row.depreciation.neg()],
      ], dp),
    );
  } else {
    out.push(
      entry('INTEREST', p, row.endDate, `Interest on lease liability, period ${p}`, [
        ['INTEREST', row.interest],
        ['LEASE_LIABILITY', row.interest.neg()],
      ], dp),
      entry('DEPRECIATION', p, row.endDate, `Depreciation of right-of-use asset, period ${p}`, [
        ['DEPRECIATION', row.depreciation],
        ['ROU_ACCUMULATED', row.depreciation.neg()],
      ], dp),
    );
  }
  return out.filter((e): e is JournalEntry => e !== null);
}

export function remeasurementEntry(
  period: number,
  date: string,
  memo: string,
  postings: readonly Posting[],
  dp: number,
): JournalEntry | null {
  return entry('REMEASUREMENT', period, date, memo, postings, dp);
}
