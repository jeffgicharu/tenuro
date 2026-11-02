import { sql, type RawBuilder } from 'kysely';

// The person's view of a lease, key date, task or saved view (v_lease and the rest) names each row
// by coalesce(origin_id, id): a private copy answers to the id of the shared row it replaces. Row-level
// security will not evaluate that expression before its own policy (Postgres cannot prove it leaks
// nothing), so a lookup by it read every row of the company first. This condition says the same thing
// in terms Postgres pushes down to an index (the primary key, or the origin index); callers keep the
// exact comparison on the view id beside it, so the rows returned are unchanged.
export function viewIdIn(ids: readonly string[], alias?: string): RawBuilder<boolean> {
  const p = alias ? `${alias}.` : '';
  return sql<boolean>`(${sql.ref(`${p}id`)} = ANY(${[...ids]}::uuid[]) OR ${sql.ref(`${p}origin_id`)} = ANY(${[...ids]}::uuid[]))`;
}
