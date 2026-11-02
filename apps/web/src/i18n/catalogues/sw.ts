import { sw } from '../messages/sw.ts';
import { leaseSw } from '../../features/lease/messages.ts';
import { leaseFormSw } from '../../features/lease-form/messages.ts';

// Features append their own messages here.
const catalogue: Record<string, string> = { ...sw, ...leaseSw, ...leaseFormSw };
export default catalogue;
