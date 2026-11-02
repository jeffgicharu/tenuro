import type { DecimalInput } from './decimal.js';

export type Frequency = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
export type PaymentTiming = 'ADVANCE' | 'ARREARS';
export type AccountingStandard = 'IFRS16' | 'ASC842_FINANCE' | 'ASC842_OPERATING';
export type Exemption = 'NONE' | 'SHORT_TERM' | 'LOW_VALUE';

/** Money in output is a fixed-point decimal string at the currency's minor unit, e.g. "1234.50". */
export type Money = string;

export type RentSpec =
  /** The same payment every period. */
  | { kind: 'FIXED'; amount: DecimalInput }
  /** Compounding uplift applied every `upliftEveryPeriods` periods (default: once a year). */
  | { kind: 'FIXED_ESCALATION'; amount: DecimalInput; annualRate: DecimalInput; upliftEveryPeriods?: number }
  /**
   * Index-linked rent. Measured at the index in force at commencement (IFRS 16.27(b), 16.28;
   * ASC 842-10-30-5(b)); later index movements are applied with `remeasure` and an INDEX_CHANGE.
   */
  | { kind: 'INDEXED'; amount: DecimalInput }
  /** Explicit steps; the first step must start at period 1. A step of 0 models a rent-free period. */
  | { kind: 'STEPPED'; steps: ReadonlyArray<{ fromPeriod: number; amount: DecimalInput }> }
  /** One amount per period, in order. */
  | { kind: 'EXPLICIT'; payments: readonly DecimalInput[] };

export interface AdditionalPayment {
  /** 1-based period in which the amount falls due (paid on that period's payment date). */
  period: number;
  amount: DecimalInput;
  kind: 'RESIDUAL_VALUE_GUARANTEE' | 'PURCHASE_OPTION' | 'TERMINATION_PENALTY';
}

export interface LeaseAccountingInput {
  currency: string;
  /** ISO date. Period 1 starts on this date. */
  commencementDate: string;
  frequency: Frequency;
  timing: PaymentTiming;
  /** Lease term in periods, after reasonably-certain options are applied (see `effectiveTerm`). */
  termPeriods: number;
  rent: RentSpec;
  additionalPayments?: readonly AdditionalPayment[];
  /** Incremental borrowing rate (or rate implicit in the lease), as an effective annual rate: "0.05" = 5%. */
  annualDiscountRate: DecimalInput;
  initialDirectCosts?: DecimalInput;
  incentivesReceived?: DecimalInput;
  /** Lease payments made before commencement, held as prepaid until then. */
  prepayments?: DecimalInput;
  /** Restoration (dismantling) provision recognised at commencement, measured under IAS 37. IFRS 16 only. */
  restorationProvision?: DecimalInput;
  /** Useful life of the underlying asset, in periods. */
  usefulLifePeriods?: number;
  /** True when ownership transfers at the end of the term or a purchase option is reasonably certain. */
  transfersOwnership?: boolean;
  standard: AccountingStandard;
  exemption?: Exemption;
}

export interface ScheduleRow {
  period: number;
  startDate: string;
  endDate: string;
  /** Date the period's lease payment falls due: start for advance, end for arrears. */
  paymentDate: string;
  openingLiability: Money;
  /** Part of the period's payment applied to the lease liability. */
  payment: Money;
  interest: Money;
  closingLiability: Money;
  openingRou: Money;
  /** Depreciation (IFRS 16, ASC 842 finance) or the ROU amortisation plug (ASC 842 operating). */
  depreciation: Money;
  closingRou: Money;
  /** Total lease cost in profit or loss for the period. */
  leaseCost: Money;
  /** Cash paid in the period, including a payment made at commencement. */
  cashPaid: Money;
  /** 0 for the original measurement, then 1, 2, ... after each remeasurement. */
  segment: number;
}

export interface JournalLine {
  account: string;
  accountName: string;
  debit: Money;
  credit: Money;
}

export interface JournalEntry {
  /** 0 is commencement; remeasurements carry the period they take effect in. */
  period: number;
  date: string;
  kind:
    | 'COMMENCEMENT'
    | 'INTEREST'
    | 'PAYMENT'
    | 'DEPRECIATION'
    | 'OPERATING_LEASE_COST'
    | 'EXEMPT_LEASE_COST'
    | 'REMEASUREMENT';
  memo: string;
  lines: JournalLine[];
}

export interface ScheduleTotals {
  payments: Money;
  cashPaid: Money;
  interest: Money;
  depreciation: Money;
  leaseCost: Money;
}

export interface ScheduleBasis {
  /** Rent per period, index 0 = period 1. */
  rent: Money[];
  /** Additional payments per period (guarantees, purchase options, penalties). */
  extra: Money[];
  annualDiscountRate: string;
  periodRate: string;
  termPeriods: number;
  depreciationEndPeriod: number;
}

export type ChangeKind = LeaseChange['kind'];

export interface RemeasurementEvent {
  kind: ChangeKind;
  effectiveDate: string;
  period: number;
  liabilityBefore: Money;
  rouBefore: Money;
  liabilityAfter: Money;
  rouAfter: Money;
  liabilityAdjustment: Money;
  rouAdjustment: Money;
  /** Positive is a gain, negative a loss. */
  profitOrLoss: Money;
  annualDiscountRate: string;
  journal: JournalEntry | null;
}

export interface CommencementAmounts {
  liability: Money;
  commencementPayment: Money;
  initialDirectCosts: Money;
  prepayments: Money;
  /** Restoration provision included in the ROU asset (zero under ASC 842). */
  restoration: Money;
  incentives: Money;
}

export interface Schedule {
  input: LeaseAccountingInput;
  currency: string;
  minorUnits: number;
  periodsPerYear: number;
  initialLiability: Money;
  initialRou: Money;
  /** Payment made at commencement (advance leases), included in the ROU asset, not the liability. */
  commencementPayment: Money;
  /** The amounts making up the ROU asset at commencement. Journals are derived with `scheduleJournals`. */
  commencement: CommencementAmounts;
  rows: ScheduleRow[];
  totals: ScheduleTotals;
  basis: ScheduleBasis;
  events: RemeasurementEvent[];
  /** Plain-English notes on treatments applied, e.g. amounts accounted for outside the schedule. */
  notes: string[];
}

export type LeaseChange =
  /** A movement in the index that drives INDEXED rent. Uses the unchanged discount rate (IFRS 16.42(b), 16.43). */
  | { kind: 'INDEX_CHANGE'; previousIndex: DecimalInput; newIndex: DecimalInput }
  /** A change in the amount expected under a residual value guarantee. Unchanged discount rate (IFRS 16.42(a)). */
  | { kind: 'RESIDUAL_GUARANTEE_CHANGE'; period: number; amount: DecimalInput }
  /** A change in the lease term after reassessing an option. Revised discount rate (IFRS 16.40(a)). */
  | {
      kind: 'TERM_REASSESSMENT';
      newTermPeriods: number;
      revisedAnnualDiscountRate: DecimalInput;
      /** Rent for added periods; defaults to repeating the last rent payment. */
      extensionPayment?: DecimalInput;
    }
  /** A change in the assessment of a purchase option. Revised discount rate (IFRS 16.40(b)). */
  | {
      kind: 'PURCHASE_OPTION_REASSESSMENT';
      /** Exercise price now reasonably certain to be paid, or null when it no longer is. */
      exercisePrice: DecimalInput | null;
      revisedAnnualDiscountRate: DecimalInput;
      usefulLifePeriods?: number;
    }
  /** A modification that adds a right of use at a stand-alone price: a separate lease (IFRS 16.44). */
  | { kind: 'MODIFICATION_SEPARATE_LEASE'; lease: LeaseAccountingInput }
  /** A modification that decreases scope (IFRS 16.46(a)). */
  | {
      kind: 'MODIFICATION_SCOPE_DECREASE';
      /** Share of the right of use given up, e.g. "0.4". */
      fraction: DecimalInput;
      revisedAnnualDiscountRate: DecimalInput;
      /** Rent for remaining periods; defaults to current rent × (1 − fraction). */
      revisedPayment?: DecimalInput;
    }
  /** Any other modification, e.g. a term extension or a rent change (IFRS 16.46(b)). */
  | {
      kind: 'MODIFICATION_OTHER';
      revisedAnnualDiscountRate: DecimalInput;
      newTermPeriods?: number;
      /** Rent for every remaining period, including any added ones. Defaults to current rent, with added periods repeating the last rent. */
      revisedPayment?: DecimalInput;
    };

export interface Remeasurement {
  kind: ChangeKind;
  effectiveDate: string;
  before: { liability: Money; rou: Money };
  after: { liability: Money; rou: Money };
  adjustments: { liability: Money; rou: Money; profitOrLoss: Money };
  journal: JournalEntry | null;
  /** The remeasured schedule. For a separate-lease modification this is the original, untouched. */
  schedule: Schedule;
  /** Only for MODIFICATION_SEPARATE_LEASE: the new lease's own schedule. */
  separateLease?: Schedule;
}
