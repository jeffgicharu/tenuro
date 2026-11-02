import { ar } from '../messages/ar.ts';
import { leaseAr } from '../../features/lease/messages.ar.ts';
import { leaseFormAr } from '../../features/lease-form/messages.ar.ts';
import { registerAr } from '../../features/register/messages.ar.ts';
import { dashboardAr } from '../../features/dashboard/messages.ar.ts';
import { keyDatesAr } from '../../features/keydates/messages.ar.ts';
import { accountingAr } from '../../features/accounting/messages.ar.ts';
import { reportsAr } from '../../features/reports/messages.ar.ts';

// Features append their own messages here.
const catalogue: Record<string, string> = { ...ar, ...leaseAr, ...leaseFormAr, ...registerAr, ...dashboardAr, ...keyDatesAr, ...accountingAr, ...reportsAr };
export default catalogue;
