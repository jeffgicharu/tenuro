import { en } from '../messages/en.ts';
import { leaseFormEn } from '../../features/lease-form/messages.ts';

// Features append their own messages here.
const catalogue: Record<string, string> = { ...en, ...leaseFormEn };
export default catalogue;
