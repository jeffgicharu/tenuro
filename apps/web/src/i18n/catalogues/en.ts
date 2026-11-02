import { en } from '../messages/en.ts';
import { leaseEn } from '../../features/lease/messages.ts';
import { leaseFormEn } from '../../features/lease-form/messages.ts';
import { registerEn } from '../../features/register/messages.ts';

// Features append their own messages here.
const catalogue: Record<string, string> = { ...en, ...leaseEn, ...leaseFormEn, ...registerEn };
export default catalogue;
