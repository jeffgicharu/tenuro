import { sw } from '../messages/sw.ts';
import { leaseFormSw } from '../../features/lease-form/messages.ts';

// Features append their own messages here.
const catalogue: Record<string, string> = { ...sw, ...leaseFormSw };
export default catalogue;
