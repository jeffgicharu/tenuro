// Resizes the approved photography into the web formats the app serves. Run once after new photos
// arrive: node scripts/process-media.mjs <incoming-media dir>. Output is committed; sharp never runs on the server.
import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const source = process.argv[2];
if (!source) throw new Error('usage: process-media.mjs <incoming-media dir>');
const out = new URL('../public/static/photos/', import.meta.url).pathname;

const sets = [
  { dir: 'exteriors', widths: [800, 1600] },
  { dir: 'interiors', widths: [800, 1600] },
  { dir: 'backdrop', widths: [1440, 2880] },
];

for (const { dir, widths } of sets) {
  await mkdir(join(out, dir), { recursive: true });
  for (const file of (await readdir(join(source, 'photos', dir))).filter((f) => f.endsWith('.jpg'))) {
    // ea-01-office-westlands-midrise.jpg -> ea-01 ; signin-backdrop-atrium.jpg -> signin
    const base = dir === 'backdrop' ? file.split('-')[0] : file.split('-').slice(0, 2).join('-');
    for (const w of widths) {
      const img = sharp(join(source, 'photos', dir, file)).resize({ width: w, withoutEnlargement: true });
      await img.clone().avif({ quality: 52, effort: 6 }).toFile(join(out, dir, `${base}-${w}.avif`));
      await img.clone().jpeg({ quality: 78, mozjpeg: true, progressive: true }).toFile(join(out, dir, `${base}-${w}.jpg`));
    }
    // The unsized name is the large JPEG, used where a single URL is needed (documents, Open Graph).
    await sharp(join(source, 'photos', dir, file)).resize({ width: widths.at(-1) }).jpeg({ quality: 80, mozjpeg: true })
      .toFile(join(out, dir, `${base}.jpg`));
    console.log(`${dir}/${base}`);
  }
}
