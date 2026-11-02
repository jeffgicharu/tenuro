import { createDb } from '../db/client.ts';
import { todayIso } from '../domain/dates.ts';
import { rebuild } from './rebuild.ts';

const db = createDb(process.env.OWNER_DATABASE_URL, 2);
const today = process.env.SEED_TODAY ?? todayIso();
const scale = process.env.SEED_SCALE ? Number(process.env.SEED_SCALE) : 1;
console.log(`Building seed portfolio for ${today} (scale ${scale})`);
try {
  const report = await rebuild(db, { today, scale });
  const total = Object.values(report.rows).reduce((a, b) => a + b, 0);
  console.log(`${total} rows; generated in ${Math.round(report.generateMs)} ms, written in ${Math.round(report.writeMs)} ms`);
} finally {
  await db.destroy();
}
