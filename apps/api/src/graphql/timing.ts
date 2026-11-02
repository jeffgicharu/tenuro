import type { GraphQLField, GraphQLSchema } from 'graphql';
import type { Plugin } from 'graphql-yoga';
import type { Context } from './context.ts';

// Server-Timing for GraphQL responses: the session lookup, the whole execution, and the slowest
// top-level fields, so a browser's network panel (or a performance audit) shows where a page's
// query spends its time. Field names are already public in the schema; no data is exposed.

const timingsOf = new WeakMap<object, Map<string, number>>();

export function startTimings(request: object, session: number): Map<string, number> {
  const t = new Map<string, number>([['session', session]]);
  timingsOf.set(request, t);
  return t;
}

// Statements are grouped by their text (parameters are placeholders, so one query shape is one entry).
const statementsOf = new WeakMap<Map<string, number>, Map<string, { ms: number; n: number }>>();

export function recordStatement(timings: Map<string, number>) {
  const statements = new Map<string, { ms: number; n: number }>();
  statementsOf.set(timings, statements);
  return (sqlText: string, ms: number) => {
    const s = statements.get(sqlText) ?? { ms: 0, n: 0 };
    s.ms += ms; s.n += 1;
    statements.set(sqlText, s);
  };
}

// A short, header-safe label for a statement: its text on one line, without quotes, cut to 90 characters.
const label = (sqlText: string) => sqlText.replace(/\s+/g, ' ').replace(/["\\]/g, '').trim().slice(0, 90);

const TIMED = new Set(['Query', 'Mutation', 'Viewer', 'Portfolio', 'AccountingSummary', 'Lease', 'LeaseAccounting']);
const SHOWN = 6;

// Wraps the resolvers of the types above so each field adds its own time (excluding its children's).
export function timeFields(schema: GraphQLSchema): GraphQLSchema {
  // Types are matched by name (and duck-typed) rather than with graphql's isObjectType, which fails
  // when a test runner loads graphql twice.
  for (const type of Object.values(schema.getTypeMap())) {
    if (!TIMED.has(type.name) || !('getFields' in type)) continue;
    for (const field of Object.values(type.getFields()) as GraphQLField<unknown, Context>[]) {
      const resolve = field.resolve;
      if (!resolve) continue; // plain property reads cost nothing worth reporting
      const name = `${type.name}.${field.name}`;
      field.resolve = (source, args, ctx: Context, info) => {
        const t = ctx.timings;
        if (!t) return resolve(source, args, ctx, info);
        const start = performance.now();
        const add = () => t.set(name, (t.get(name) ?? 0) + performance.now() - start);
        const out = resolve(source, args, ctx, info) as unknown;
        if (out && typeof (out as Promise<unknown>).then === 'function') {
          return (out as Promise<unknown>).then(
            (v) => { add(); return v; },
            (e: unknown) => { add(); throw e; },
          );
        }
        add();
        return out;
      };
    }
  }
  return schema;
}

export function useServerTiming(): Plugin<Context> {
  return {
    onExecute({ args }) {
      const start = performance.now();
      const t = (args.contextValue as Context).timings;
      return { onExecuteDone: () => { t?.set('execute', performance.now() - start); } };
    },
    onResponse({ request, response }) {
      const t = timingsOf.get(request);
      if (!t) return;
      const fixed = ['session', 'execute'].filter((k) => t.has(k)).map((k) => `${k};dur=${t.get(k)!.toFixed(1)}`);
      const fields = [...t.entries()]
        .filter(([k]) => k.includes('.'))
        .sort((a, b) => b[1] - a[1])
        .slice(0, SHOWN)
        .map(([k, v], i) => `f${i + 1};desc="${k}";dur=${v.toFixed(1)}`);
      const statements = statementsOf.get(t);
      const db: string[] = [];
      if (statements?.size) {
        const all = [...statements.entries()];
        const total = all.reduce((a, [, s]) => a + s.ms, 0);
        const count = all.reduce((a, [, s]) => a + s.n, 0);
        db.push(`db;desc="${count} statements";dur=${total.toFixed(1)}`);
        all.sort((a, b) => b[1].ms - a[1].ms).slice(0, 4)
          .forEach(([text, s], i) => db.push(`s${i + 1};desc="${s.n > 1 ? `${s.n}x ` : ''}${label(text)}";dur=${s.ms.toFixed(1)}`));
      }
      response.headers.set('server-timing', [...fixed, ...db, ...fields].join(', '));
    },
  };
}
