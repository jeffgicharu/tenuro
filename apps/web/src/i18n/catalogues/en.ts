import { en } from '../messages/en.ts';
import { leaseEn } from '../../features/lease/messages.ts';
import { registerEn } from '../../features/register/messages.ts';

// Features append their own messages here.
const catalogue: Record<string, string> = { ...en, ...leaseEn, ...registerEn };
export default catalogue;
