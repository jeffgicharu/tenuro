import { emptyLeaseForm, type LeaseFormData } from '@tenuro/lease-rules';

// A complete lease that passes every rule, for tests to start from and change.
export function validLease(): LeaseFormData {
  const f = emptyLeaseForm({ currency: 'KES', lesseeEntity: 'Mbuyu Court Holdings (Kenya) Limited' });
  f.parties.landlord = { name: 'Nyakoro Properties Limited', contactName: 'Achieng Mwangi', email: 'leasing@nyakoro.example', phone: '' };
  f.property = { propertyId: 'UHJvcGVydHk6MTIz', premises: 'Level 4, North', areaSqm: '420' };
  f.term = { commencementDate: '2026-01-01', expiryDate: '2031-12-31' };
  f.rent.paymentFrequency = 'QUARTERLY';
  f.rent.paymentTiming = 'ADVANCE';
  f.rent.rentPerPeriod = '1250000';
  f.rent.escalation = { kind: 'FIXED', ratePercent: '5', everyMonths: '12', firstReviewOn: '2027-01-01', indexName: '', capPercent: '', collarPercent: '' };
  f.options = [{ kind: 'BREAK', exerciseOn: '2029-01-01', noticeBy: '2028-07-01', termMonths: '', price: '', reasonablyCertain: false, terms: '' }];
  f.accounting.discountRatePercent = '13.5';
  return f;
}
