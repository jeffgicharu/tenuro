import { type DecimalInput, dec } from './decimal.js';

export interface Asc842Criteria {
  /** (a) Ownership transfers to the lessee by the end of the term. */
  transfersOwnership: boolean;
  /** (b) A purchase option the lessee is reasonably certain to exercise. */
  purchaseOptionReasonablyCertain: boolean;
  /** (c) Lease term in months and the asset's remaining economic life in months. */
  leaseTermMonths: number;
  remainingEconomicLifeMonths: number;
  /** (d) Present value of lease payments and residual value guarantees, and the asset's fair value. */
  presentValueOfPayments: DecimalInput;
  fairValue: DecimalInput;
  /** (e) The asset is so specialised it has no alternative use to the lessor at the end of the term. */
  specialisedAsset: boolean;
  /** True when the term starts at or near the end of the asset's economic life, which disables criterion (c). */
  commencesNearEndOfLife?: boolean;
}

export interface Asc842Policy {
  /** "Major part" of remaining economic life. 75% is the common policy threshold (ASC 842-10-55-2). */
  majorPart: DecimalInput;
  /** "Substantially all" of fair value. 90% is the common policy threshold. */
  substantiallyAll: DecimalInput;
}

export interface Asc842Classification {
  classification: 'FINANCE' | 'OPERATING';
  met: Array<'OWNERSHIP_TRANSFER' | 'PURCHASE_OPTION' | 'MAJOR_PART_OF_LIFE' | 'SUBSTANTIALLY_ALL_FAIR_VALUE' | 'SPECIALISED_ASSET'>;
}

/** Lessee classification under ASC 842-10-25-2: finance if any one of the five criteria is met. */
export function classifyAsc842(
  criteria: Asc842Criteria,
  policy: Asc842Policy = { majorPart: '0.75', substantiallyAll: '0.90' },
): Asc842Classification {
  const met: Asc842Classification['met'] = [];
  if (criteria.transfersOwnership) met.push('OWNERSHIP_TRANSFER');
  if (criteria.purchaseOptionReasonablyCertain) met.push('PURCHASE_OPTION');
  if (
    !criteria.commencesNearEndOfLife &&
    criteria.remainingEconomicLifeMonths > 0 &&
    dec(criteria.leaseTermMonths, 'leaseTermMonths')
      .div(criteria.remainingEconomicLifeMonths)
      .greaterThanOrEqualTo(dec(policy.majorPart, 'majorPart'))
  ) {
    met.push('MAJOR_PART_OF_LIFE');
  }
  const fairValue = dec(criteria.fairValue, 'fairValue');
  if (
    fairValue.isPositive() &&
    dec(criteria.presentValueOfPayments, 'presentValueOfPayments')
      .div(fairValue)
      .greaterThanOrEqualTo(dec(policy.substantiallyAll, 'substantiallyAll'))
  ) {
    met.push('SUBSTANTIALLY_ALL_FAIR_VALUE');
  }
  if (criteria.specialisedAsset) met.push('SPECIALISED_ASSET');
  return { classification: met.length ? 'FINANCE' : 'OPERATING', met };
}
