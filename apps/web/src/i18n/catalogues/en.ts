import { en } from '../messages/en.ts';
import { leaseEn } from '../../features/lease/messages.ts';
import { leaseFormEn } from '../../features/lease-form/messages.ts';
import { registerEn } from '../../features/register/messages.ts';
import { dashboardEn } from '../../features/dashboard/messages.ts';
import { keyDatesEn } from '../../features/keydates/messages.ts';
import { accountingEn } from '../../features/accounting/messages.ts';
import { reportsEn } from '../../features/reports/messages.ts';

// Features append their own messages here.
const catalogue: Record<string, string> = { ...en, ...leaseEn, ...leaseFormEn, ...registerEn, ...dashboardEn, ...keyDatesEn, ...accountingEn, ...reportsEn };
export default catalogue;
