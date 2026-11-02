import { writeFileSync } from 'node:fs';
import { lexicographicSortSchema, printSchema, validateSchema } from 'graphql';
import { schema } from '../graphql/schema.ts';

// Writes schema.graphql for relay-compiler and fails loudly if the schema is invalid.
const errors = validateSchema(schema);
if (errors.length) {
  for (const e of errors) console.error(e.message);
  process.exit(1);
}
const out = new URL('../../schema.graphql', import.meta.url);
writeFileSync(out, `${printSchema(lexicographicSortSchema(schema))}\n`);
console.log(`wrote ${out.pathname}`);
