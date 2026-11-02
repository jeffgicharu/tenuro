// Documents rendered from the lease data: the lease agreement as a typeset, printable HTML page (in
// the company's working language, right to left for Arabic), and the demise plan as an SVG drawn to
// the premises' area. HTML rather than PDF so Arabic shapes correctly and readers can print to PDF.

export interface AgreementData {
  reference: string; premises: string; property_name: string; city: string; country_code: string; area_sqm: string;
  commencement_date: string; expiry_date: string; currency: string; payment_frequency: string; payment_timing: string;
  rent_per_period: string; service_charge_per_period: string | null; landlord_name: string; lessee_entity: string;
  parties: { role: string; name: string; contact_name: string | null; address: string | null }[];
  options: { kind: string; exercise_on: string; notice_by: string | null; term_months: number | null; terms: string | null }[];
  deposits: { kind: string; amount: string; held_by: string | null }[];
  escalations: { kind: string; rate: string | null; every_months: number; index_name: string | null }[];
}

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const T = {
  en: {
    title: 'Lease agreement', between: 'Between', landlord: 'Landlord', tenant: 'Tenant', premises: 'The premises', term: 'Term',
    rent: 'Rent', review: 'Rent review', options: 'Options', deposit: 'Security', signatures: 'Signed for and on behalf of',
    commencing: 'commencing on', ending: 'and ending on', area: 'having an area of approximately', perPeriod: { MONTHLY: 'a month', QUARTERLY: 'a quarter', ANNUAL: 'a year' } as Record<string, string>,
    timing: { ADVANCE: 'in advance', ARREARS: 'in arrears' } as Record<string, string>, service: 'Service charge', reference: 'Reference',
    esc: { FIXED: (r: string, m: number) => `fixed increase of ${r} every ${m} months`, CPI: (_r: string, m: number, idx: string) => `reviewed every ${m} months in line with ${idx}`, MARKET_REVIEW: (_r: string, m: number) => `reviewed to open market rent every ${m} months` },
    opt: { BREAK: 'Tenant break', RENEWAL: 'Renewal', PURCHASE: 'Purchase', EXTENSION: 'Extension' } as Record<string, string>,
    noticeBy: 'notice by', exercisable: 'exercisable on', none: 'None', heldBy: 'held by', generated: 'Rendered from the lease record',
  },
  ar: {
    title: 'عقد إيجار', between: 'بين', landlord: 'المؤجر', tenant: 'المستأجر', premises: 'العين المؤجرة', term: 'المدة',
    rent: 'الإيجار', review: 'مراجعة الإيجار', options: 'الخيارات', deposit: 'الضمان', signatures: 'وقّع عن',
    commencing: 'تبدأ في', ending: 'وتنتهي في', area: 'بمساحة تقارب', perPeriod: { MONTHLY: 'شهرياً', QUARTERLY: 'كل ربع سنة', ANNUAL: 'سنوياً' } as Record<string, string>,
    timing: { ADVANCE: 'مقدماً', ARREARS: 'مؤخراً' } as Record<string, string>, service: 'رسوم الخدمات', reference: 'المرجع',
    esc: { FIXED: (r: string, m: number) => `زيادة ثابتة بنسبة ${r} كل ${m} شهراً`, CPI: (_r: string, m: number, idx: string) => `تُراجع كل ${m} شهراً وفق ${idx}`, MARKET_REVIEW: (_r: string, m: number) => `تُراجع إلى إيجار السوق كل ${m} شهراً` },
    opt: { BREAK: 'إنهاء مبكر للمستأجر', RENEWAL: 'تجديد', PURCHASE: 'شراء', EXTENSION: 'تمديد' } as Record<string, string>,
    noticeBy: 'الإشعار قبل', exercisable: 'يُمارس في', none: 'لا يوجد', heldBy: 'لدى', generated: 'مُعدّ من سجل العقد',
  },
};

export function renderAgreement(d: AgreementData, lang: 'en' | 'ar'): string {
  const t = T[lang];
  const locale = lang === 'ar' ? 'ar' : 'en-GB';
  const date = (iso: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  const money = (amount: string | null) => (amount === null ? '' : new Intl.NumberFormat(locale, { style: 'currency', currency: d.currency, currencyDisplay: 'code' }).format(Number(amount)));
  const pct = (r: string | null) => (r === null ? '' : new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 }).format(Number(r)));
  const landlord = d.parties.find((p) => p.role === 'LANDLORD');
  const reviews = d.escalations.map((e) => {
    const f = t.esc[e.kind as keyof typeof t.esc];
    return f ? f(pct(e.rate), e.every_months, e.index_name ?? 'CPI') : '';
  }).filter(Boolean);
  const clause = (n: number, heading: string, body: string) => `<section><h2><span class="n">${n}.</span> ${esc(heading)}</h2>${body}</section>`;
  return `<!doctype html>
<html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t.title)} · ${esc(d.reference)}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; background: #ece6da; font: 15px/1.65 Georgia, 'Times New Roman', 'Noto Naskh Arabic', serif; color: #1c1a16; }
  main { max-width: 720px; margin: 32px auto; background: #fffdf8; padding: 56px 64px; box-shadow: 0 10px 40px -20px rgba(60,45,20,.45); }
  header { border-bottom: 2px solid #1c1a16; padding-bottom: 18px; margin-bottom: 28px; }
  h1 { font-size: 30px; font-weight: 500; margin: 0 0 6px; letter-spacing: -.01em; }
  .meta { font: 12px/1.5 system-ui, sans-serif; color: #55504a; }
  h2 { font-size: 16px; margin: 26px 0 8px; } .n { color: #8a8378; margin-inline-end: 4px; }
  p { margin: 0 0 10px; } dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 18px; margin: 0; } dt { color: #55504a; } dd { margin: 0; }
  ul { margin: 0; padding-inline-start: 20px; }
  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 48px; } .line { border-top: 1px solid #1c1a16; padding-top: 6px; font: 12px/1.4 system-ui, sans-serif; color: #55504a; }
  footer { margin-top: 40px; font: 11px/1.4 system-ui, sans-serif; color: #8a8378; }
  @media (max-width: 640px) { main { margin: 0; padding: 28px 22px; } .sign { grid-template-columns: 1fr; } }
  @media print { body { background: none; } main { box-shadow: none; margin: 0; padding: 0; max-width: none; } }
</style></head>
<body><main>
<header><h1>${esc(t.title)}</h1><div class="meta">${esc(t.reference)} ${esc(d.reference)} · ${esc(d.property_name)}, ${esc(d.city)}</div></header>
${clause(1, t.between, `<dl><dt>${esc(t.landlord)}</dt><dd>${esc(d.landlord_name)}${landlord?.address ? `, ${esc(landlord.address)}` : ''}</dd><dt>${esc(t.tenant)}</dt><dd>${esc(d.lessee_entity)}</dd></dl>`)}
${clause(2, t.premises, `<p>${esc(d.premises)}, ${esc(d.property_name)}, ${esc(d.city)} — ${esc(t.area)} ${esc(new Intl.NumberFormat(locale).format(Number(d.area_sqm)))} m².</p>`)}
${clause(3, t.term, `<p>${esc(t.commencing)} ${esc(date(d.commencement_date))} ${esc(t.ending)} ${esc(date(d.expiry_date))}.</p>`)}
${clause(4, t.rent, `<p>${esc(money(d.rent_per_period))} ${esc(t.perPeriod[d.payment_frequency] ?? '')}, ${esc(t.timing[d.payment_timing] ?? '')}.</p>${d.service_charge_per_period && Number(d.service_charge_per_period) > 0 ? `<p>${esc(t.service)}: ${esc(money(d.service_charge_per_period))} ${esc(t.perPeriod[d.payment_frequency] ?? '')}.</p>` : ''}`)}
${clause(5, t.review, reviews.length ? `<p>${reviews.map(esc).join('; ')}.</p>` : `<p>${esc(t.none)}.</p>`)}
${clause(6, t.options, d.options.length ? `<ul>${d.options.map((o) => `<li>${esc(t.opt[o.kind] ?? o.kind)}: ${esc(t.exercisable)} ${esc(date(o.exercise_on))}${o.notice_by ? `, ${esc(t.noticeBy)} ${esc(date(o.notice_by))}` : ''}.${o.terms ? ` ${esc(o.terms)}` : ''}</li>`).join('')}</ul>` : `<p>${esc(t.none)}.</p>`)}
${clause(7, t.deposit, d.deposits.length ? `<ul>${d.deposits.map((x) => `<li>${esc(money(x.amount))}${x.held_by ? `, ${esc(t.heldBy)} ${esc(x.held_by)}` : ''}</li>`).join('')}</ul>` : `<p>${esc(t.none)}.</p>`)}
<div class="sign"><div class="line">${esc(t.signatures)} ${esc(t.landlord)}<br>${esc(d.landlord_name)}</div><div class="line">${esc(t.signatures)} ${esc(t.tenant)}<br>${esc(d.lessee_entity)}</div></div>
<footer>${esc(t.generated)} · Tenuro</footer>
</main></body></html>`;
}

// A demise plan: the premises as a hatched rectangle in proportion to its area, inside the floor
// outline, with a scale bar and a north point. Schematic, as most plans attached to leases are.
export function renderPlan(d: { reference: string; premises: string; property_name: string; area_sqm: string }, lang: 'en' | 'ar'): string {
  const area = Math.max(10, Number(d.area_sqm));
  const ratio = 1.6;
  const wM = Math.sqrt(area * ratio); const hM = area / wM;
  const floorW = wM * 1.8; const floorH = hM * 1.7;
  const scale = 520 / floorW; const W = 640; const H = Math.round(floorH * scale + 160);
  const ox = 60; const oy = 80; const px = ox + (floorW - wM) * scale * 0.35; const py = oy + (floorH - hM) * scale * 0.45;
  const bar = [5, 10, 20, 50].find((m) => m * scale >= 70) ?? 50;
  const title = lang === 'ar' ? 'مخطط المساحة المؤجرة' : 'Demise plan';
  const label = lang === 'ar' ? 'المساحة المؤجرة' : 'Demised premises';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui, sans-serif" direction="${lang === 'ar' ? 'rtl' : 'ltr'}">
  <defs><pattern id="h" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#a3301c" stroke-width="1.2"/></pattern></defs>
  <rect width="${W}" height="${H}" fill="#fffdf8"/>
  <text x="${W / 2}" y="34" text-anchor="middle" font-size="18" fill="#1c1a16">${esc(title)} · ${esc(d.reference)}</text>
  <text x="${W / 2}" y="56" text-anchor="middle" font-size="12" fill="#55504a">${esc(d.property_name)} · ${esc(d.premises)}</text>
  <rect x="${ox}" y="${oy}" width="${(floorW * scale).toFixed(1)}" height="${(floorH * scale).toFixed(1)}" fill="none" stroke="#1c1a16" stroke-width="3"/>
  <rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${(wM * scale).toFixed(1)}" height="${(hM * scale).toFixed(1)}" fill="url(#h)" stroke="#a3301c" stroke-width="2"/>
  <text x="${(px + (wM * scale) / 2).toFixed(1)}" y="${(py + (hM * scale) / 2).toFixed(1)}" text-anchor="middle" font-size="13" fill="#1c1a16" paint-order="stroke" stroke="#fffdf8" stroke-width="4">${esc(label)}</text>
  <text x="${(px + (wM * scale) / 2).toFixed(1)}" y="${(py + (hM * scale) / 2 + 18).toFixed(1)}" text-anchor="middle" font-size="12" fill="#55504a" paint-order="stroke" stroke="#fffdf8" stroke-width="4">≈ ${Math.round(area)} m²</text>
  <g transform="translate(${ox}, ${H - 40})"><rect width="${(bar * scale).toFixed(1)}" height="6" fill="#1c1a16"/><text y="22" font-size="11" fill="#55504a">0</text><text x="${(bar * scale).toFixed(1)}" y="22" font-size="11" text-anchor="end" fill="#55504a">${bar} m</text></g>
  <g transform="translate(${W - 60}, ${H - 60})"><path d="M0,-22 L8,6 L0,0 L-8,6 Z" fill="#1c1a16"/><text y="22" text-anchor="middle" font-size="12" fill="#1c1a16">N</text></g>
</svg>`;
}

// A rent review memorandum: the latest rent change on the lease, as a short dated note.
export function renderMemo(d: { reference: string; property_name: string; city: string; currency: string; payment_frequency: string; landlord_name: string; lessee_entity: string },
  step: { starts_on: string; rent_per_period: string }, previous: string, lang: 'en' | 'ar'): string {
  const locale = lang === 'ar' ? 'ar' : 'en-GB';
  const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${step.starts_on}T00:00:00Z`));
  const money = (a: string) => new Intl.NumberFormat(locale, { style: 'currency', currency: d.currency, currencyDisplay: 'code' }).format(Number(a));
  const change = Number(previous) > 0 ? (Number(step.rent_per_period) / Number(previous) - 1) : 0;
  const pct = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1, signDisplay: 'always' }).format(change);
  const per = T[lang].perPeriod[d.payment_frequency] ?? '';
  const L = lang === 'ar'
    ? { title: 'مذكرة مراجعة الإيجار', body: `اتفق الطرفان على أن يصبح الإيجار ${money(step.rent_per_period)} ${per} اعتباراً من ${date} (كان ${money(previous)}، بتغيّر ${pct}).`, parties: `${d.landlord_name} و${d.lessee_entity}` }
    : { title: 'Rent review memorandum', body: `The parties agree that from ${date} the rent is ${money(step.rent_per_period)} ${per} (previously ${money(previous)}, a change of ${pct}).`, parties: `${d.landlord_name} and ${d.lessee_entity}` };
  return `<!doctype html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(L.title)} · ${esc(d.reference)}</title>
<style>body{margin:0;background:#ece6da;font:15px/1.65 Georgia,'Times New Roman','Noto Naskh Arabic',serif;color:#1c1a16}main{max-width:640px;margin:32px auto;background:#fffdf8;padding:48px 56px;box-shadow:0 10px 40px -20px rgba(60,45,20,.45)}h1{font-size:26px;font-weight:500;margin:0 0 6px}.meta{font:12px/1.5 system-ui,sans-serif;color:#55504a;border-bottom:2px solid #1c1a16;padding-bottom:14px;margin-bottom:22px}@media (max-width:640px){main{margin:0;padding:28px 22px}}@media print{body{background:none}main{box-shadow:none;margin:0}}</style></head>
<body><main><h1>${esc(L.title)}</h1><div class="meta">${esc(d.reference)} · ${esc(d.property_name)}, ${esc(d.city)} · ${esc(L.parties)}</div><p>${esc(L.body)}</p></main></body></html>`;
}
