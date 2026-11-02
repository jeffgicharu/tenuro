import { ar } from '../messages/ar.ts';
import { leaseAr } from '../../features/lease/messages.ts';
import { registerAr } from '../../features/register/messages.ts';

// Features append their own messages here.
const catalogue: Record<string, string> = { ...ar, ...leaseAr, ...registerAr };
export default catalogue;
