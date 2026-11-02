import { printSchema } from 'graphql';
import { validateLease, emptyLeaseForm } from '@tenuro/lease-rules';
import { rentSchedule } from './domain/rent.ts';
import { generate } from './seed/generate.ts';
import { schema } from './graphql/schema.ts';

// Runs without a database or network: proves every module loads and the CPU can run the maths.
// CI runs it under qemu64 (no SSE4, no AVX); the server runs it again at every activation.
export function selfcheck(): string[] {
  const done: string[] = [];
  const sdl = printSchema(schema);
  if (!sdl.includes('type Lease implements Node')) throw new Error('schema did not build');
  done.push(`schema ${sdl.length} chars`);

  const periods = rentSchedule({
    commencementDate: '2026-01-01', expiryDate: '2035-12-31', frequency: 'MONTHLY', timing: 'ARREARS', rentPerPeriod: '10000',
    escalations: [{ kind: 'FIXED', rate: '0.05', everyMonths: 12, firstReviewOn: '2027-01-01', cap: null, collar: null }], steps: [],
  }, 2);
  if (periods.length !== 120 || periods.at(-1)!.rent.toFixed(2) !== '15513.28') throw new Error('rent schedule is wrong');
  done.push('rent schedule 120 periods');

  const issues = validateLease(emptyLeaseForm({ currency: 'KES', lesseeEntity: '' }));
  if (issues.length === 0) throw new Error('validation did not run');
  done.push(`validation ${issues.length} issues on an empty form`);

  const data = generate({ today: '2026-06-15', scale: 0.002 });
  if (data.lease.length < 20) throw new Error('seed generator produced too little');
  done.push(`generator ${data.lease.length} leases`);
  return done;
}
