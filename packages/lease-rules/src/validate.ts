import type { Issue, IssueCode, LeaseFormData, LeaseFormStep } from './types.ts';

export const CURRENCIES = ['KES', 'UGX', 'TZS', 'RWF', 'USD', 'AED', 'SAR', 'BHD', 'OMR', 'GBP', 'EUR'] as const;
export const MINOR_UNITS: Record<string, number> = {
  KES: 2, UGX: 0, TZS: 2, RWF: 0, USD: 2, AED: 2, SAR: 2, BHD: 3, OMR: 3, GBP: 2, EUR: 2,
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL = /^-?\d+(\.\d+)?$/;

export function isIsoDate(v: string): boolean {
  if (!ISO_DATE.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number) as [number, number, number];
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// Months from commencement to the day after expiry; a part month counts as a whole one.
// 1 Jan 2026 to 31 Dec 2026 is 12 months; 15 Jan 2026 to 14 Jan 2027 is 12; to 20 Jan 2027 is 13.
export function monthsInTerm(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number) as [number, number, number];
  const [y2, m2, d2] = nextDay(to).split('-').map(Number) as [number, number, number];
  const whole = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  return d2 === d1 ? whole : whole + 1;
}

const DEFAULT_MESSAGES: Record<IssueCode, string> = {
  required: 'This is required.',
  too_long: 'This is too long.',
  invalid_number: 'Enter a number, using a full stop for decimals.',
  must_be_positive: 'Enter an amount greater than zero.',
  must_not_be_negative: 'This cannot be negative.',
  too_many_decimals: 'This currency allows {places} decimal places.',
  invalid_date: 'Enter a valid date.',
  date_before: 'This must be on or after {other}.',
  date_after: 'This must be on or before {other}.',
  outside_term: 'This must fall within the lease term.',
  notice_after_exercise: 'The notice deadline must come before the option date.',
  out_of_range: 'Enter a value between {min} and {max}.',
  too_many: 'You can add up to {max}.',
  invalid_email: 'Enter an email address like name@example.com.',
  invalid_currency: 'Choose a currency from the list.',
  short_term_too_long: 'The short-term exemption only applies to leases of 12 months or less, including options you are reasonably certain to take.',
  class_required: 'Choose finance or operating for ASC 842.',
  duplicate_date: 'Two rent steps start on the same date.',
  unknown_property: 'Choose a property from the portfolio.',
  not_whole_number: 'Enter a whole number.',
};

const format = (template: string, params?: Record<string, string | number>) =>
  params ? template.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? '')) : template;

class Collector {
  readonly issues: Issue[] = [];

  add(step: LeaseFormStep, path: string, code: IssueCode, params?: Record<string, string | number>) {
    this.issues.push({ step, path, code, message: format(DEFAULT_MESSAGES[code], params), ...(params ? { params } : {}) });
  }

  text(step: LeaseFormStep, path: string, value: string, opts: { required?: boolean; max?: number } = {}) {
    const v = value.trim();
    if (!v) {
      if (opts.required) this.add(step, path, 'required');
      return;
    }
    if (v.length > (opts.max ?? 200)) this.add(step, path, 'too_long', { max: opts.max ?? 200 });
  }

  amount(step: LeaseFormStep, path: string, value: string, currency: string, opts: { required?: boolean; positive?: boolean } = {}) {
    const v = value.trim();
    if (!v) {
      if (opts.required) this.add(step, path, 'required');
      return;
    }
    if (!DECIMAL.test(v) || v.replace(/[-.]/g, '').length > 15) return this.add(step, path, 'invalid_number');
    const n = Number(v);
    if (opts.positive && n <= 0) return this.add(step, path, 'must_be_positive');
    if (n < 0) return this.add(step, path, 'must_not_be_negative');
    const places = MINOR_UNITS[currency] ?? 2;
    if ((v.split('.')[1]?.length ?? 0) > places) this.add(step, path, 'too_many_decimals', { places });
  }

  number(step: LeaseFormStep, path: string, value: string, opts: { required?: boolean; min: number; max: number; integer?: boolean }) {
    const v = value.trim();
    if (!v) {
      if (opts.required) this.add(step, path, 'required');
      return;
    }
    if (!DECIMAL.test(v)) return this.add(step, path, 'invalid_number');
    const n = Number(v);
    if (opts.integer && !Number.isInteger(n)) return this.add(step, path, 'not_whole_number');
    if (n < opts.min || n > opts.max) this.add(step, path, 'out_of_range', { min: opts.min, max: opts.max });
  }

  date(step: LeaseFormStep, path: string, value: string, required = false): boolean {
    if (!value) {
      if (required) this.add(step, path, 'required');
      return false;
    }
    if (!isIsoDate(value)) {
      this.add(step, path, 'invalid_date');
      return false;
    }
    return true;
  }
}

// Validates the whole form, or only the listed steps. Cross-step rules (dates against the term,
// the short-term exemption against options) are reported on the step the person must change.
export function validateLease(data: LeaseFormData, steps: readonly LeaseFormStep[] | 'all' = 'all'): Issue[] {
  const c = new Collector();
  const want = (s: LeaseFormStep) => steps === 'all' || steps.includes(s);
  const currency = data.rent.currency;
  const { commencementDate: start, expiryDate: end } = data.term;
  const termValid = isIsoDate(start) && isIsoDate(end) && end > start;

  if (want('parties')) {
    const { landlord, lesseeEntity, guarantor, agent } = data.parties;
    c.text('parties', 'parties.landlord.name', landlord.name, { required: true, max: 160 });
    c.text('parties', 'parties.landlord.contactName', landlord.contactName, { max: 120 });
    if (landlord.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(landlord.email.trim())) c.add('parties', 'parties.landlord.email', 'invalid_email');
    c.text('parties', 'parties.landlord.phone', landlord.phone, { max: 40 });
    c.text('parties', 'parties.lesseeEntity', lesseeEntity, { required: true, max: 160 });
    for (const [key, party] of [['guarantor', guarantor], ['agent', agent]] as const) {
      if (!party) continue;
      c.text('parties', `parties.${key}.name`, party.name, { required: true, max: 160 });
      if (party.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(party.email.trim())) c.add('parties', `parties.${key}.email`, 'invalid_email');
    }
  }

  if (want('property')) {
    if (!data.property.propertyId) c.add('property', 'property.propertyId', 'required');
    c.text('property', 'property.premises', data.property.premises, { required: true, max: 160 });
    c.number('property', 'property.areaSqm', data.property.areaSqm, { required: true, min: 1, max: 1_000_000 });
  }

  if (want('term')) {
    const okStart = c.date('term', 'term.commencementDate', start, true);
    const okEnd = c.date('term', 'term.expiryDate', end, true);
    if (okStart && okEnd) {
      if (end <= start) c.add('term', 'term.expiryDate', 'date_before', { other: start });
      else if (monthsInTerm(start, end) > 99 * 12) c.add('term', 'term.expiryDate', 'out_of_range', { min: 1, max: '99 years' });
    }
  }

  if (want('rent')) {
    if (!(CURRENCIES as readonly string[]).includes(currency)) c.add('rent', 'rent.currency', 'invalid_currency');
    c.amount('rent', 'rent.rentPerPeriod', data.rent.rentPerPeriod, currency, { required: true, positive: true });
    c.amount('rent', 'rent.serviceChargePerPeriod', data.rent.serviceChargePerPeriod, currency);
    const e = data.rent.escalation;
    if (e.kind !== 'NONE') {
      c.number('rent', 'rent.escalation.everyMonths', e.everyMonths, { required: true, min: 1, max: 120, integer: true });
      if (c.date('rent', 'rent.escalation.firstReviewOn', e.firstReviewOn, true) && termValid) {
        if (e.firstReviewOn <= start || e.firstReviewOn > end) c.add('rent', 'rent.escalation.firstReviewOn', 'outside_term');
      }
    }
    if (e.kind === 'FIXED') c.number('rent', 'rent.escalation.ratePercent', e.ratePercent, { required: true, min: 0.01, max: 25 });
    if (e.kind === 'CPI') {
      c.text('rent', 'rent.escalation.indexName', e.indexName, { required: true, max: 80 });
      c.number('rent', 'rent.escalation.capPercent', e.capPercent, { min: 0, max: 25 });
      c.number('rent', 'rent.escalation.collarPercent', e.collarPercent, { min: 0, max: 25 });
    }
    if (data.rent.steps.length > 40) c.add('rent', 'rent.steps', 'too_many', { max: 40 });
    const seen = new Set<string>();
    data.rent.steps.forEach((s, i) => {
      if (c.date('rent', `rent.steps.${i}.startsOn`, s.startsOn, true) && termValid && (s.startsOn <= start || s.startsOn > end)) {
        c.add('rent', `rent.steps.${i}.startsOn`, 'outside_term');
      }
      if (seen.has(s.startsOn)) c.add('rent', `rent.steps.${i}.startsOn`, 'duplicate_date');
      seen.add(s.startsOn);
      c.amount('rent', `rent.steps.${i}.rentPerPeriod`, s.rentPerPeriod, currency, { required: true, positive: true });
    });
  }

  if (want('options')) {
    if (data.options.length > 10) c.add('options', 'options', 'too_many', { max: 10 });
    data.options.forEach((o, i) => {
      const p = `options.${i}`;
      const okExercise = c.date('options', `${p}.exerciseOn`, o.exerciseOn, true);
      const okNotice = c.date('options', `${p}.noticeBy`, o.noticeBy, o.kind !== 'PURCHASE');
      if (okExercise && termValid) {
        // A renewal starts the day after expiry; breaks and purchases fall inside the term.
        const latest = o.kind === 'RENEWAL' ? nextDay(end) : end;
        if (o.exerciseOn <= start || o.exerciseOn > latest) c.add('options', `${p}.exerciseOn`, 'outside_term');
      }
      if (okExercise && okNotice && o.noticeBy >= o.exerciseOn) c.add('options', `${p}.noticeBy`, 'notice_after_exercise');
      if (o.kind === 'RENEWAL') c.number('options', `${p}.termMonths`, o.termMonths, { required: true, min: 1, max: 600, integer: true });
      if (o.kind === 'PURCHASE') c.amount('options', `${p}.price`, o.price, currency, { required: true, positive: true });
      c.text('options', `${p}.terms`, o.terms, { max: 1000 });
    });
  }

  if (want('deposits')) {
    if (data.deposits.length > 5) c.add('deposits', 'deposits', 'too_many', { max: 5 });
    data.deposits.forEach((d, i) => {
      c.amount('deposits', `deposits.${i}.amount`, d.amount, currency, { required: true, positive: true });
      c.text('deposits', `deposits.${i}.heldBy`, d.heldBy, { required: true, max: 160 });
      if (c.date('deposits', `deposits.${i}.returnDueOn`, d.returnDueOn) && termValid && d.returnDueOn < start) {
        c.add('deposits', `deposits.${i}.returnDueOn`, 'date_before', { other: start });
      }
    });
  }

  if (want('accounting')) {
    const a = data.accounting;
    c.number('accounting', 'accounting.discountRatePercent', a.discountRatePercent, { required: true, min: 0.01, max: 40 });
    for (const k of ['initialDirectCosts', 'incentives', 'prepayments', 'restorationCost'] as const) {
      c.amount('accounting', `accounting.${k}`, a[k], currency);
    }
    c.number('accounting', 'accounting.usefulLifeMonths', a.usefulLifeMonths, { min: 1, max: 1200, integer: true });
    c.text('accounting', 'accounting.costCentre', a.costCentre, { max: 40 });
    if (a.standard === 'ASC842' && !a.asc842Class) c.add('accounting', 'accounting.asc842Class', 'class_required');
    if (a.exemption === 'SHORT_TERM' && termValid) {
      const certainRenewal = data.options
        .filter((o) => o.kind === 'RENEWAL' && o.reasonablyCertain)
        .reduce((m, o) => m + (Number(o.termMonths) || 0), 0);
      if (monthsInTerm(start, end) + certainRenewal > 12) c.add('accounting', 'accounting.exemption', 'short_term_too_long');
    }
  }

  if (want('review') || steps === 'all') {
    if (data.notes.length > 4000) c.add('review', 'notes', 'too_long', { max: 4000 });
  }

  return c.issues;
}

function nextDay(iso: string): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

export const issuesByStep = (issues: Issue[]) => {
  const map = new Map<LeaseFormStep, Issue[]>();
  for (const i of issues) map.set(i.step, [...(map.get(i.step) ?? []), i]);
  return map;
};
