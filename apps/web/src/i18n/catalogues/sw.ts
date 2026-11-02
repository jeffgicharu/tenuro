import { sw } from '../messages/sw.ts';
import { leaseSw } from '../../features/lease/messages.ts';
import { leaseFormSw } from '../../features/lease-form/messages.ts';
import { registerSw } from '../../features/register/messages.ts';
import { dashboardSw } from '../../features/dashboard/messages.ts';

// Features append their own messages here.
const catalogue: Record<string, string> = { ...sw, ...leaseSw, ...leaseFormSw, ...registerSw, ...dashboardSw };
export default catalogue;
