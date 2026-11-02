import { sw } from '../messages/sw.ts';
import { leaseSw } from '../../features/lease/messages.ts';
import { registerSw } from '../../features/register/messages.ts';

// Features append their own messages here.
const catalogue: Record<string, string> = { ...sw, ...leaseSw, ...registerSw };
export default catalogue;
