import { readFileSync, existsSync } from 'node:fs';
import { GraphQLError, parse, type ASTVisitor, type ValidationContext } from 'graphql';
import type { Plugin } from 'graphql-yoga';
import { usePersistedOperations } from '@graphql-yoga/plugin-persisted-operations';
import { withScope } from '../db/client.ts';
import { createLoaders, type Context } from './context.ts';

// Runs each operation inside one transaction scoped to the caller's tenant and sandbox.
export function useScopedTransaction(): Plugin<Context> {
  return {
    onExecute({ executeFn, setExecuteFn }) {
      setExecuteFn((args) => {
        const ctx = args.contextValue as Context;
        const scope = { tenantId: ctx.session?.tenantId ?? null, sandboxId: ctx.session?.sandboxId ?? null };
        return withScope(ctx.db, scope, async (tx) => {
          ctx.tx = tx;
          ctx.loaders = createLoaders(tx);
          const result = await executeFn(args);
          // Roll back if anything failed, so a partly applied mutation never commits.
          if ('errors' in result && result.errors?.length) throw new RollbackWith(result);
          return result;
        }).catch((err: unknown) => {
          if (err instanceof RollbackWith) return err.result;
          throw err;
        });
      });
    },
  };
}

class RollbackWith extends Error {
  readonly result: unknown;
  constructor(result: unknown) {
    super('rollback');
    this.result = result;
  }
}

// Caps aliases so one request cannot fan out the same expensive field many times.
export function maxAliasesRule(max: number) {
  return (context: ValidationContext): ASTVisitor => {
    let count = 0;
    return {
      Field(node) {
        if (node.alias && ++count > max) {
          context.reportError(new GraphQLError(`Too many aliases (limit ${max}).`, { nodes: [node], extensions: { code: 'QUERY_TOO_COMPLEX' } }));
        }
      },
    };
  };
}

export function useOperationLimits(opts: { maxTokens: number; maxAliases: number }): Plugin {
  return {
    onParse({ setParseFn }) {
      setParseFn((source, options) => parse(source, { ...options, maxTokens: opts.maxTokens }));
    },
    onValidate({ addValidationRule }) {
      addValidationRule(maxAliasesRule(opts.maxAliases));
    },
  };
}

// The client sends {"id": "<hash>"}; only operations relay-compiler wrote at build time can run.
export function usePersistedOnly(mapPath: string): Plugin {
  const map: Record<string, string> = existsSync(mapPath) ? JSON.parse(readFileSync(mapPath, 'utf8')) : {};
  return usePersistedOperations({
    allowArbitraryOperations: false,
    extractPersistedOperationId: (params) => (typeof (params as { id?: unknown }).id === 'string' ? (params as { id: string }).id : null),
    getPersistedOperation: (key) => map[key] ?? null,
  });
}
