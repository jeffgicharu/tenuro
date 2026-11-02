import { ar } from '../messages/ar.ts';
import { leaseAr } from '../../features/lease/messages.ts';
import { leaseFormAr } from '../../features/lease-form/messages.ts';

// Features append their own messages here.
const catalogue: Record<string, string> = { ...ar, ...leaseAr, ...leaseFormAr };
export default catalogue;
