import { builder } from './builder.ts';
import './errors.ts';
import './types/common.ts';
import './types/tenant.ts';
import './types/lease.ts';
import './types/workflow.ts';
import './types/viewer.ts';
import './mutations/drafts.ts';
import './mutations/leases.ts';
import './mutations/tasks.ts';
import './mutations/views.ts';
import './mutations/sandbox.ts';

export const schema = builder.toSchema({ sortSchema: true });
