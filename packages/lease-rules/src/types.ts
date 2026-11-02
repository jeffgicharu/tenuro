export const LEASE_FORM_STEPS = ['parties', 'property', 'term', 'rent', 'options', 'deposits', 'accounting', 'review'] as const;
export type LeaseFormStep = (typeof LEASE_FORM_STEPS)[number];

export type EscalationChoice = 'NONE' | 'FIXED' | 'CPI' | 'MARKET_REVIEW';

export interface PartyData {
  name: string;
  contactName: string;
  email: string;
  phone: string;
}

export interface RentStepData {
  startsOn: string;
  rentPerPeriod: string;
}

export interface OptionData {
  kind: 'BREAK' | 'RENEWAL' | 'PURCHASE';
  exerciseOn: string;
  noticeBy: string;
  termMonths: string;
  price: string;
  reasonablyCertain: boolean;
  terms: string;
}

export interface DepositData {
  kind: 'CASH' | 'BANK_GUARANTEE' | 'LETTER_OF_CREDIT';
  amount: string;
  heldBy: string;
  returnDueOn: string;
}

// Everything the new-lease and amend-lease form holds. Numbers stay strings until submit, so what
// the person typed is never reformatted under them and decimals are never rounded by a float.
export interface LeaseFormData {
  parties: {
    landlord: PartyData;
    lesseeEntity: string;
    guarantor: PartyData | null;
    agent: PartyData | null;
  };
  property: {
    propertyId: string | null;
    premises: string;
    areaSqm: string;
  };
  term: {
    commencementDate: string;
    expiryDate: string;
  };
  rent: {
    currency: string;
    paymentFrequency: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
    paymentTiming: 'ADVANCE' | 'ARREARS';
    rentPerPeriod: string;
    serviceChargePerPeriod: string;
    escalation: {
      kind: EscalationChoice;
      ratePercent: string;
      everyMonths: string;
      firstReviewOn: string;
      indexName: string;
      capPercent: string;
      collarPercent: string;
    };
    steps: RentStepData[];
  };
  options: OptionData[];
  deposits: DepositData[];
  accounting: {
    discountRatePercent: string;
    initialDirectCosts: string;
    incentives: string;
    prepayments: string;
    restorationCost: string;
    usefulLifeMonths: string;
    ownershipTransfers: boolean;
    standard: 'IFRS16' | 'ASC842';
    asc842Class: '' | 'FINANCE' | 'OPERATING';
    exemption: 'NONE' | 'SHORT_TERM' | 'LOW_VALUE';
    costCentre: string;
  };
  notes: string;
}

export interface Issue {
  path: string;
  step: LeaseFormStep;
  code: IssueCode;
  message: string;
  params?: Record<string, string | number>;
}

export type IssueCode =
  | 'required' | 'too_long' | 'invalid_number' | 'must_be_positive' | 'must_not_be_negative' | 'too_many_decimals'
  | 'invalid_date' | 'date_before' | 'date_after' | 'outside_term' | 'notice_after_exercise' | 'out_of_range'
  | 'too_many' | 'invalid_email' | 'invalid_currency' | 'short_term_too_long' | 'class_required' | 'duplicate_date'
  | 'unknown_property' | 'not_whole_number';

export const emptyParty = (): PartyData => ({ name: '', contactName: '', email: '', phone: '' });

export function emptyLeaseForm(defaults: { currency: string; lesseeEntity: string }): LeaseFormData {
  return {
    parties: { landlord: emptyParty(), lesseeEntity: defaults.lesseeEntity, guarantor: null, agent: null },
    property: { propertyId: null, premises: '', areaSqm: '' },
    term: { commencementDate: '', expiryDate: '' },
    rent: {
      currency: defaults.currency, paymentFrequency: 'QUARTERLY', paymentTiming: 'ADVANCE', rentPerPeriod: '', serviceChargePerPeriod: '',
      escalation: { kind: 'NONE', ratePercent: '', everyMonths: '12', firstReviewOn: '', indexName: '', capPercent: '', collarPercent: '' },
      steps: [],
    },
    options: [],
    deposits: [],
    accounting: {
      discountRatePercent: '', initialDirectCosts: '', incentives: '', prepayments: '', restorationCost: '', usefulLifeMonths: '',
      ownershipTransfers: false, standard: 'IFRS16', asc842Class: '', exemption: 'NONE', costCentre: '',
    },
    notes: '',
  };
}
