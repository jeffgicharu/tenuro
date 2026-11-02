/** Default chart of accounts used in generated journals. The API can map these codes to a client's own ledger. */
export const ACCOUNTS = {
  CASH: { code: '1000', name: 'Cash at bank' },
  PREPAID_LEASE: { code: '1450', name: 'Prepaid lease payments' },
  ROU_ASSET: { code: '1610', name: 'Right-of-use assets' },
  ROU_ACCUMULATED: { code: '1619', name: 'Accumulated depreciation, right-of-use assets' },
  LEASE_LIABILITY: { code: '2610', name: 'Lease liabilities' },
  RESTORATION_PROVISION: { code: '2650', name: 'Restoration provisions' },
  ACCRUED_LEASE: { code: '2690', name: 'Accrued lease expense' },
  INTEREST: { code: '6810', name: 'Interest on lease liabilities' },
  DEPRECIATION: { code: '6820', name: 'Depreciation of right-of-use assets' },
  OPERATING_LEASE_COST: { code: '6830', name: 'Operating lease cost' },
  EXEMPT_LEASE_COST: { code: '6840', name: 'Short-term and low-value lease expense' },
  MODIFICATION_GAIN_LOSS: { code: '7910', name: 'Gain or loss on lease modification' },
} as const;

export type AccountKey = keyof typeof ACCOUNTS;
