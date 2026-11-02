import { sw } from '../messages/sw.ts';
import { leaseSw } from '../../features/lease/messages.ts';

// Features append their own messages here.
const catalogue: Record<string, string> = { ...sw, ...leaseSw };
export default catalogue;
