import { sw } from '../messages/sw.ts';
import { leaseSw } from '../../features/lease/messages.sw.ts';
import { leaseFormSw } from '../../features/lease-form/messages.sw.ts';
import { registerSw } from '../../features/register/messages.sw.ts';
import { dashboardSw } from '../../features/dashboard/messages.sw.ts';
import { keyDatesSw } from '../../features/keydates/messages.sw.ts';
import { accountingSw } from '../../features/accounting/messages.sw.ts';
import { reportsSw } from '../../features/reports/messages.sw.ts';

// Features append their own messages here.
const catalogue: Record<string, string> = { ...sw, ...leaseSw, ...leaseFormSw, ...registerSw, ...dashboardSw, ...keyDatesSw, ...accountingSw, ...reportsSw };
export default catalogue;
