import { sw } from '../messages/sw.ts';

// Features append their own messages here.
const catalogue: Record<string, string> = { ...sw };
export default catalogue;
