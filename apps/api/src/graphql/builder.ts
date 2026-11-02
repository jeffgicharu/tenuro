import SchemaBuilder from '@pothos/core';
import ComplexityPlugin from '@pothos/plugin-complexity';
import DataloaderPlugin from '@pothos/plugin-dataloader';
import ErrorsPlugin from '@pothos/plugin-errors';
import RelayPlugin from '@pothos/plugin-relay';
import Decimal from 'decimal.js';
import { GraphQLError, Kind } from 'graphql';
import { isValidIsoDate } from '../domain/dates.ts';
import type { Context } from './context.ts';

export const builder = new SchemaBuilder<{
  Context: Context;
  DefaultFieldNullability: false;
  DefaultEdgesNullability: false;
  DefaultNodeNullability: false;
  Connection: { totalCount: number };
  Scalars: {
    Date: { Input: string; Output: string };
    DateTime: { Input: string; Output: Date | string };
    Decimal: { Input: string; Output: string };
    CurrencyCode: { Input: string; Output: string };
    CountryCode: { Input: string; Output: string };
  };
}>({
  plugins: [ErrorsPlugin, RelayPlugin, DataloaderPlugin, ComplexityPlugin],
  defaultFieldNullability: false,
  relay: {
    clientMutationId: 'omit',
    cursorType: 'String',
    // Each connection field already multiplies by its page size, so the edges list inside it
    // must not multiply again by the default list factor.
    edgesFieldOptions: { nullable: false, complexity: { field: 1, multiplier: 1 } },
    nodeFieldOptions: { nullable: false },
  },
  errors: { defaultTypes: [] },
  complexity: {
    defaultComplexity: 1,
    defaultListMultiplier: 10,
    // The lease page asks for every section's first page at once (about 6,100). Production also
    // runs only persisted queries, so this guards development and any future public API.
    limit: { complexity: 20_000, depth: 12, breadth: 400 },
  },
});

const parseString = (name: string, valid: (v: string) => boolean, message: string) => ({
  serialize: (v: unknown) => v as string,
  parseValue: (v: unknown) => {
    if (typeof v !== 'string' || !valid(v)) throw new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT', scalar: name } });
    return v;
  },
  parseLiteral: (ast: { kind: string; value?: unknown }) => {
    if (ast.kind !== Kind.STRING || typeof ast.value !== 'string' || !valid(ast.value)) {
      throw new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT', scalar: name } });
    }
    return ast.value;
  },
});

builder.scalarType('Date', {
  description: 'A calendar date, YYYY-MM-DD, with no time zone.',
  ...parseString('Date', isValidIsoDate, 'Expected a date as YYYY-MM-DD'),
});

builder.scalarType('DateTime', {
  description: 'An instant, ISO 8601 with offset.',
  serialize: (v) => (v instanceof Date ? v.toISOString() : new Date(v).toISOString()),
  parseValue: (v) => {
    if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) throw new GraphQLError('Expected an ISO 8601 date-time');
    return v;
  },
});

builder.scalarType('Decimal', {
  description: 'An exact decimal number, sent as a string so no precision is lost.',
  ...parseString('Decimal', (v) => /^-?\d{1,15}(\.\d{1,10})?$/.test(v), 'Expected a decimal number as a string'),
  serialize: (v) => (v === null || v === undefined ? v : new Decimal(v as string).toFixed()),
});

builder.scalarType('CurrencyCode', {
  description: 'An ISO 4217 currency code.',
  ...parseString('CurrencyCode', (v) => /^[A-Z]{3}$/.test(v), 'Expected an ISO 4217 currency code'),
});

builder.scalarType('CountryCode', {
  description: 'An ISO 3166-1 alpha-2 country code.',
  ...parseString('CountryCode', (v) => /^[A-Z]{2}$/.test(v), 'Expected an ISO 3166-1 alpha-2 country code'),
});

builder.queryType({});
builder.mutationType({});

builder.globalConnectionField('totalCount', (t) =>
  t.int({ description: 'Rows matching the current filters, across all pages.', resolve: (parent) => parent.totalCount }),
);
