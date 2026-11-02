import { ar } from '../messages/ar.ts';
import { leaseFormAr } from '../../features/lease-form/messages.ts';

// Features append their own messages here.
const catalogue: Record<string, string> = { ...ar, ...leaseFormAr };
export default catalogue;
