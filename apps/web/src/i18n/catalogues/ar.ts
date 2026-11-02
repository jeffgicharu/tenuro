import { ar } from '../messages/ar.ts';
import { leaseAr } from '../../features/lease/messages.ts';
import { leaseFormAr } from '../../features/lease-form/messages.ts';
import { registerAr } from '../../features/register/messages.ts';
import { dashboardAr } from '../../features/dashboard/messages.ts';

// Features append their own messages here.
const catalogue: Record<string, string> = { ...ar, ...leaseAr, ...leaseFormAr, ...registerAr, ...dashboardAr };
export default catalogue;
