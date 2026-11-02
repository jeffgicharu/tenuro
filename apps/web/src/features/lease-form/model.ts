import Decimal from 'decimal.js';
import { LEASE_FORM_STEPS, MINOR_UNITS, emptyLeaseForm, type LeaseFormData, type LeaseFormStep } from '@tenuro/lease-rules';

export type Path = string;

const segments = (path: Path) => path.split('.').map((s) => (/^\d+$/.test(s) ? Number(s) : s));

export function getAt(obj: unknown, path: Path): unknown {
  let cur: unknown = obj;
  for (const key of segments(path)) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Record<string | number, unknown>)[key];
  }
  return cur;
}

// Immutable update along a dotted path; arrays and objects on the way are copied.
export function setAt<T>(obj: T, path: Path, value: unknown): T {
  const keys = segments(path);
  const walk = (node: unknown, i: number): unknown => {
    const key = keys[i]!;
    const base = Array.isArray(node) ? [...node] : { ...(node as Record<string, unknown>) };
    const next = i === keys.length - 1 ? value : walk((node as Record<string | number, unknown> | null)?.[key] ?? (typeof keys[i + 1] === 'number' ? [] : {}), i + 1);
    (base as Record<string | number, unknown>)[key] = next;
    return base;
  };
  return walk(obj, 0) as T;
}

// Field ids are stable and derived from the path, so error summaries can link straight to fields.
export const fieldId = (path: Path) => `lf-${path.replace(/\./g, '-')}`;

// Message key for a field label: "options.2.exerciseOn" -> "leaseForm.field.options.exerciseOn".
export const labelKey = (path: Path) => `leaseForm.field.${path.replace(/\.\d+(?=\.|$)/g, '')}`;

export const isStep = (v: unknown): v is LeaseFormStep => typeof v === 'string' && (LEASE_FORM_STEPS as readonly string[]).includes(v);

// Merges a stored draft onto an empty form, so data saved by an older client still has every field.
export function normaliseForm(raw: unknown, defaults: LeaseFormData): LeaseFormData {
  if (!raw || typeof raw !== 'object') return defaults;
  const v = raw as Partial<LeaseFormData>;
  return {
    ...defaults,
    ...v,
    parties: { ...defaults.parties, ...v.parties },
    property: { ...defaults.property, ...v.property },
    term: { ...defaults.term, ...v.term },
    rent: { ...defaults.rent, ...v.rent, escalation: { ...defaults.rent.escalation, ...v.rent?.escalation }, steps: Array.isArray(v.rent?.steps) ? v.rent.steps : [] },
    accounting: { ...defaults.accounting, ...v.accounting },
    options: Array.isArray(v.options) ? v.options : [],
    deposits: Array.isArray(v.deposits) ? v.deposits : [],
    notes: typeof v.notes === 'string' ? v.notes : '',
  };
}

export function parseForm(json: string | null | undefined, fallback?: LeaseFormData): LeaseFormData {
  const defaults = fallback ?? emptyLeaseForm({ currency: 'USD', lesseeEntity: '' });
  if (!json) return defaults;
  try {
    return normaliseForm(JSON.parse(json), defaults);
  } catch {
    return defaults;
  }
}

const blank = (v: string) => (v.trim() === '' ? null : v.trim());
const party = (p: LeaseFormData['parties']['landlord'] | null) =>
  p ? { name: p.name.trim(), contactName: blank(p.contactName), email: blank(p.email), phone: blank(p.phone) } : null;

// The typed LeaseInput the API expects. Numbers stay strings; empty optional fields become null.
export function formToInput(f: LeaseFormData) {
  const e = f.rent.escalation;
  const int = (v: string) => (v.trim() === '' ? null : Number(v));
  return {
    landlord: party(f.parties.landlord)!,
    lesseeEntity: f.parties.lesseeEntity.trim(),
    guarantor: party(f.parties.guarantor),
    agent: party(f.parties.agent),
    propertyId: f.property.propertyId ?? '',
    premises: f.property.premises.trim(),
    areaSqm: f.property.areaSqm.trim(),
    commencementDate: f.term.commencementDate,
    expiryDate: f.term.expiryDate,
    currency: f.rent.currency,
    paymentFrequency: f.rent.paymentFrequency,
    paymentTiming: f.rent.paymentTiming,
    rentPerPeriod: f.rent.rentPerPeriod.trim(),
    serviceChargePerPeriod: blank(f.rent.serviceChargePerPeriod),
    escalation: e.kind === 'NONE' ? null : {
      kind: e.kind,
      ratePercent: e.kind === 'FIXED' ? blank(e.ratePercent) : null,
      everyMonths: Number(e.everyMonths),
      firstReviewOn: e.firstReviewOn,
      indexName: e.kind === 'CPI' ? blank(e.indexName) : null,
      capPercent: e.kind === 'CPI' ? blank(e.capPercent) : null,
      collarPercent: e.kind === 'CPI' ? blank(e.collarPercent) : null,
    },
    rentSteps: f.rent.steps.map((s) => ({ startsOn: s.startsOn, rentPerPeriod: s.rentPerPeriod.trim() })),
    options: f.options.map((o) => ({
      kind: o.kind, exerciseOn: o.exerciseOn, noticeBy: o.noticeBy || null,
      termMonths: o.kind === 'RENEWAL' ? int(o.termMonths) : null, price: o.kind === 'PURCHASE' ? blank(o.price) : null,
      reasonablyCertain: o.reasonablyCertain, terms: blank(o.terms),
    })),
    deposits: f.deposits.map((d) => ({ kind: d.kind, amount: d.amount.trim(), heldBy: d.heldBy.trim(), returnDueOn: d.returnDueOn || null })),
    accounting: {
      discountRatePercent: f.accounting.discountRatePercent.trim(),
      initialDirectCosts: blank(f.accounting.initialDirectCosts),
      incentives: blank(f.accounting.incentives),
      prepayments: blank(f.accounting.prepayments),
      restorationCost: blank(f.accounting.restorationCost),
      usefulLifeMonths: int(f.accounting.usefulLifeMonths),
      ownershipTransfers: f.accounting.ownershipTransfers,
      standard: f.accounting.standard,
      asc842Class: f.accounting.standard === 'ASC842' && f.accounting.asc842Class ? f.accounting.asc842Class : null,
      exemption: f.accounting.exemption,
    },
    costCentre: blank(f.accounting.costCentre),
    notes: blank(f.notes),
  };
}

function flatten(o: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  if (o === null || typeof o !== 'object') {
    out[prefix] = o === null || o === undefined ? '' : String(o);
    return out;
  }
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

// Normalises values that mean the same thing ("1250000.00" and "1250000") before comparing.
const canonical = (v: string) => (/^-?\d+(\.\d+)?$/.test(v) ? new Decimal(v).toFixed() : v.trim());

export interface FieldChange {
  path: Path;
  before: string;
  after: string;
}

export function diffForms(before: LeaseFormData, after: LeaseFormData): FieldChange[] {
  const a = flatten(before);
  const b = flatten(after);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter((k) => canonical(a[k] ?? '') !== canonical(b[k] ?? ''))
    .map((k) => ({ path: k, before: a[k] ?? '', after: b[k] ?? '' }));
}

export const stepOfPath = (path: Path): LeaseFormStep => {
  const head = path.split('.')[0];
  if (head === 'notes') return 'review';
  return isStep(head) ? head : 'review';
};

export const PERIODS_PER_YEAR = { MONTHLY: 12, QUARTERLY: 4, ANNUAL: 1 } as const;
const MONTHS = { MONTHLY: 1, QUARTERLY: 3, ANNUAL: 12 } as const;

const addMonths = (iso: string, months: number) => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
};

const DECIMAL = /^\d+(\.\d+)?$/;

export interface PreviewPayment {
  index: number;
  dueOn: string;
  amount: string;
}

// Payments in the first year, from the entered rent, settled steps and any fixed uplift. A preview
// only: the server's schedule and the accounting engine are the record.
export function firstYearPayments(f: LeaseFormData): PreviewPayment[] {
  const { commencementDate: start, expiryDate: end } = f.term;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || !DECIMAL.test(f.rent.rentPerPeriod)) return [];
  const months = MONTHS[f.rent.paymentFrequency];
  const places = MINOR_UNITS[f.rent.currency] ?? 2;
  const e = f.rent.escalation;
  const out: PreviewPayment[] = [];
  for (let i = 0; i * months < 12; i++) {
    const periodStart = addMonths(start, i * months);
    if (periodStart > end) break;
    const step = [...f.rent.steps].filter((s) => s.startsOn && s.startsOn <= periodStart && DECIMAL.test(s.rentPerPeriod)).sort((a, b) => (a.startsOn < b.startsOn ? 1 : -1))[0];
    let rent = new Decimal(step ? step.rentPerPeriod : f.rent.rentPerPeriod);
    if (e.kind === 'FIXED' && DECIMAL.test(e.ratePercent) && e.firstReviewOn && periodStart >= e.firstReviewOn && Number(e.everyMonths) > 0) {
      let n = 0;
      for (let d = e.firstReviewOn; d <= periodStart; d = addMonths(d, Number(e.everyMonths))) n++;
      rent = rent.mul(new Decimal(1).plus(new Decimal(e.ratePercent).div(100)).pow(n));
    }
    const dueOn = f.rent.paymentTiming === 'ADVANCE' ? periodStart : addMonths(periodStart, months);
    out.push({ index: i + 1, dueOn: f.rent.paymentTiming === 'ADVANCE' ? dueOn : addDaysIso(dueOn, -1), amount: rent.toDecimalPlaces(places, Decimal.ROUND_HALF_UP).toFixed(places) });
  }
  return out;
}

const addDaysIso = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export function annualRentAtStart(f: LeaseFormData): string | null {
  if (!DECIMAL.test(f.rent.rentPerPeriod)) return null;
  const places = MINOR_UNITS[f.rent.currency] ?? 2;
  return new Decimal(f.rent.rentPerPeriod).mul(PERIODS_PER_YEAR[f.rent.paymentFrequency]).toFixed(places);
}
