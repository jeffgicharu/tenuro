import Decimal from 'decimal.js';
import { builder } from '../builder.ts';

export interface MoneyShape {
  amount: string;
  currency: string;
}

// Normalises Postgres numeric output ("999000.0000") to a plain decimal string ("999000").
export const decimalString = (v: string | number) => new Decimal(v).toFixed();

export const money = (amount: string | number, currency: string): MoneyShape => ({ amount: decimalString(amount), currency });

export const Money = builder.objectRef<MoneyShape>('Money').implement({
  description: 'An exact amount in one currency. Format it with the viewer locale; never parse it as a float.',
  fields: (t) => ({
    amount: t.field({ type: 'Decimal', resolve: (m) => m.amount }),
    currency: t.field({ type: 'CurrencyCode', resolve: (m) => m.currency }),
  }),
});

const enumOf = <const T extends readonly string[]>(name: string, values: T, description?: string) =>
  builder.enumType(name, { values, ...(description ? { description } : {}) });

export const UserRoleEnum = enumOf('UserRole', ['ADMIN', 'MANAGER', 'VIEWER'] as const);
export const PropertyTypeEnum = enumOf('PropertyType', ['OFFICE', 'RETAIL', 'WAREHOUSE', 'INDUSTRIAL', 'MIXED_USE'] as const);
export const LeaseStatusEnum = enumOf('LeaseStatus', ['DRAFT', 'ACTIVE', 'HOLDING_OVER', 'EXPIRED', 'TERMINATED'] as const);
export const PaymentFrequencyEnum = enumOf('PaymentFrequency', ['MONTHLY', 'QUARTERLY', 'ANNUAL'] as const);
export const PaymentTimingEnum = enumOf('PaymentTiming', ['ADVANCE', 'ARREARS'] as const, 'Whether each payment falls at the start (advance) or end (arrears) of its period.');
export const AccountingStandardEnum = enumOf('AccountingStandard', ['IFRS16', 'ASC842'] as const);
export const Asc842ClassEnum = enumOf('Asc842Class', ['FINANCE', 'OPERATING'] as const);
export const LeaseExemptionEnum = enumOf('LeaseExemption', ['NONE', 'SHORT_TERM', 'LOW_VALUE'] as const);
export const PartyRoleEnum = enumOf('PartyRole', ['LANDLORD', 'LESSEE_ENTITY', 'GUARANTOR', 'AGENT'] as const);
export const EscalationKindEnum = enumOf('EscalationKind', ['FIXED', 'CPI', 'MARKET_REVIEW'] as const);
export const OptionKindEnum = enumOf('OptionKind', ['BREAK', 'RENEWAL', 'PURCHASE'] as const);
export const OptionStatusEnum = enumOf('OptionStatus', ['OPEN', 'EXERCISED', 'WAIVED', 'LAPSED'] as const);
export const DepositKindEnum = enumOf('DepositKind', ['CASH', 'BANK_GUARANTEE', 'LETTER_OF_CREDIT'] as const);
export const DepositStatusEnum = enumOf('DepositStatus', ['HELD', 'PARTLY_RETURNED', 'RETURNED'] as const);
export const KeyDateKindEnum = enumOf('KeyDateKind', ['BREAK_NOTICE', 'RENEWAL_NOTICE', 'RENT_REVIEW', 'RENT_INCREASE', 'EXPIRY', 'DEPOSIT_RETURN', 'INSURANCE', 'CUSTOM'] as const);
export const KeyDateStatusEnum = enumOf('KeyDateStatus', ['UPCOMING', 'ACTIONED', 'DISMISSED'] as const);
export const TaskStatusEnum = enumOf('TaskStatus', ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const);
export const TaskPriorityEnum = enumOf('TaskPriority', ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const);
export const DocumentKindEnum = enumOf('DocumentKind', ['LEASE', 'AMENDMENT', 'FLOOR_PLAN', 'PHOTO', 'CERTIFICATE', 'CORRESPONDENCE', 'OTHER'] as const);
export const ViewScopeEnum = enumOf('ViewScope', ['LEASE_REGISTER', 'KEY_DATES', 'TASKS'] as const);
export const SortDirectionEnum = enumOf('SortDirection', ['ASC', 'DESC'] as const);

export const DateRange = builder.inputType('DateRange', {
  fields: (t) => ({
    from: t.field({ type: 'Date', required: false }),
    to: t.field({ type: 'Date', required: false }),
  }),
});

export const DecimalRange = builder.inputType('DecimalRange', {
  fields: (t) => ({
    min: t.field({ type: 'Decimal', required: false }),
    max: t.field({ type: 'Decimal', required: false }),
  }),
});
