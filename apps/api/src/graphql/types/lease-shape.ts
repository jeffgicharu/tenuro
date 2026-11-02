import type { Selectable } from 'kysely';
import type { Database } from '../../db/types.ts';

export type LeaseRow = Selectable<Database['v_lease']>;
