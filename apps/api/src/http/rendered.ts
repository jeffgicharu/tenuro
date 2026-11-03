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

// Each clause is written as a sentence, in the company's working language.
const T = {
  en: {
    title: 'Lease agreement', between: 'Between', landlord: 'Landlord', tenant: 'Tenant', premises: 'The premises', term: 'Term',
    rent: 'Rent', review: 'Rent review', options: 'Options', deposit: 'Security', signatures: 'Signed for and on behalf of',
    perPeriod: { MONTHLY: 'a month', QUARTERLY: 'a quarter', ANNUAL: 'a year' } as Record<string, string>,
    timing: { ADVANCE: 'in advance', ARREARS: 'in arrears' } as Record<string, string>, reference: 'Reference',
    premisesText: (premises: string, property: string, city: string, area: string) => `The premises are ${premises}, ${property}, ${city}, with an area of approximately ${area} m².`,
    termText: (from: string, to: string) => `The term begins on ${from} and ends on ${to}.`,
    rentText: (amount: string, per: string, timing: string) => `The rent is ${amount} ${per}, payable ${timing}.`,
    serviceText: (amount: string, per: string) => `A service charge of ${amount} ${per} is also payable.`,
    esc: {
      FIXED: (r: string, m: number) => `The rent increases by ${r} every ${m} months.`,
      CPI: (_r: string, m: number, idx: string) => `The rent is reviewed every ${m} months in line with ${idx}.`,
      MARKET_REVIEW: (_r: string, m: number) => `The rent is reviewed to the open market rent every ${m} months.`,
    },
    noReview: 'There is no rent review.',
    opt: {
      BREAK: (on: string, notice: string | null) => `The tenant may end the lease early on ${on}${notice ? `, giving notice by ${notice}` : ''}.`,
      RENEWAL: (on: string, notice: string | null) => `The tenant may renew the lease from ${on}${notice ? `, giving notice by ${notice}` : ''}.`,
      PURCHASE: (on: string) => `The tenant may buy the premises on ${on}.`,
      EXTENSION: (on: string, notice: string | null) => `The tenant may extend the lease from ${on}${notice ? `, giving notice by ${notice}` : ''}.`,
    } as Record<string, (on: string, notice: string | null) => string>,
    noOptions: 'There are no options.',
    depositText: (amount: string, by: string | null) => `A deposit of ${amount} is held${by ? ` by ${by}` : ''}.`,
    noDeposit: 'No security deposit is held.',
    prepared: 'Prepared from the lease record',
  },
  ar: {
    title: 'عقد إيجار', between: 'بين', landlord: 'المؤجر', tenant: 'المستأجر', premises: 'العين المؤجرة', term: 'المدة',
    rent: 'الإيجار', review: 'مراجعة الإيجار', options: 'الخيارات', deposit: 'الضمان', signatures: 'وقّع عن',
    perPeriod: { MONTHLY: 'شهرياً', QUARTERLY: 'كل ربع سنة', ANNUAL: 'سنوياً' } as Record<string, string>,
    timing: { ADVANCE: 'مقدماً', ARREARS: 'مؤخراً' } as Record<string, string>, reference: 'المرجع',
    premisesText: (premises: string, property: string, city: string, area: string) => `العين المؤجرة هي ${premises}، ${property}، ${city}، بمساحة تقارب ${area} م².`,
    termText: (from: string, to: string) => `تبدأ مدة الإيجار في ${from} وتنتهي في ${to}.`,
    rentText: (amount: string, per: string, timing: string) => `الإيجار ${amount} ${per}، يُدفع ${timing}.`,
    serviceText: (amount: string, per: string) => `تُدفع كذلك رسوم خدمات قدرها ${amount} ${per}.`,
    esc: {
      FIXED: (r: string, m: number) => `يزيد الإيجار بنسبة ${r} كل ${m} شهراً.`,
      CPI: (_r: string, m: number, idx: string) => `يُراجع الإيجار كل ${m} شهراً وفق ${idx}.`,
      MARKET_REVIEW: (_r: string, m: number) => `يُراجع الإيجار إلى إيجار السوق كل ${m} شهراً.`,
    },
    noReview: 'لا توجد مراجعة للإيجار.',
    opt: {
      BREAK: (on: string, notice: string | null) => `يحق للمستأجر إنهاء العقد مبكراً في ${on}${notice ? `، بإشعار قبل ${notice}` : ''}.`,
      RENEWAL: (on: string, notice: string | null) => `يحق للمستأجر تجديد العقد اعتباراً من ${on}${notice ? `، بإشعار قبل ${notice}` : ''}.`,
      PURCHASE: (on: string) => `يحق للمستأجر شراء العين في ${on}.`,
      EXTENSION: (on: string, notice: string | null) => `يحق للمستأجر تمديد العقد اعتباراً من ${on}${notice ? `، بإشعار قبل ${notice}` : ''}.`,
    } as Record<string, (on: string, notice: string | null) => string>,
    noOptions: 'لا توجد خيارات.',
    depositText: (amount: string, by: string | null) => `يُحتفظ بتأمين قدره ${amount}${by ? ` لدى ${by}` : ''}.`,
    noDeposit: 'لا يوجد تأمين.',
    prepared: 'مُعدّ من سجل العقد',
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
${clause(2, t.premises, `<p>${esc(t.premisesText(d.premises, d.property_name, d.city, new Intl.NumberFormat(locale).format(Number(d.area_sqm))))}</p>`)}
${clause(3, t.term, `<p>${esc(t.termText(date(d.commencement_date), date(d.expiry_date)))}</p>`)}
${clause(4, t.rent, `<p>${esc(t.rentText(money(d.rent_per_period), t.perPeriod[d.payment_frequency] ?? '', t.timing[d.payment_timing] ?? ''))}</p>${d.service_charge_per_period && Number(d.service_charge_per_period) > 0 ? `<p>${esc(t.serviceText(money(d.service_charge_per_period), t.perPeriod[d.payment_frequency] ?? ''))}</p>` : ''}`)}
${clause(5, t.review, `<p>${reviews.length ? reviews.map(esc).join(' ') : esc(t.noReview)}</p>`)}
${clause(6, t.options, d.options.length ? `<ul>${d.options.map((o) => `<li>${esc((t.opt[o.kind] ?? t.opt.RENEWAL!)(date(o.exercise_on), o.notice_by ? date(o.notice_by) : null))}${o.terms ? ` ${esc(o.terms)}` : ''}</li>`).join('')}</ul>` : `<p>${esc(t.noOptions)}</p>`)}
${clause(7, t.deposit, d.deposits.length ? `<ul>${d.deposits.map((x) => `<li>${esc(t.depositText(money(x.amount), x.held_by))}</li>`).join('')}</ul>` : `<p>${esc(t.noDeposit)}</p>`)}
<div class="sign"><div class="line">${esc(t.signatures)} ${esc(t.landlord)}<br>${esc(d.landlord_name)}</div><div class="line">${esc(t.signatures)} ${esc(t.tenant)}<br>${esc(d.lessee_entity)}</div></div>
<footer>${esc(t.prepared)} · Tenuro</footer>
</main></body></html>`;
}

// A demise plan: the premises as a hatched rectangle in proportion to its area, inside the floor
// outline, with a scale bar and a north point. Schematic, as most plans attached to leases are.
// A demise plan drawn as a floor plate: outer walls, a column grid with lettered and numbered grid
// lines, the building core (stairs, lifts, WCs) with its corridor, the neighbouring units outlined
// and numbered, and the demised unit hatched and labelled with its area. The north arrow and the
// scale bar sit clear of the drawing. Sized from the lease's area; the same lease draws the same plan.
export function renderPlan(d: { reference: string; premises: string; property_name: string; area_sqm: string }, lang: 'en' | 'ar'): string {
  const ar = lang === 'ar';
  const L = ar
    ? { title: 'مخطط المساحة المؤجرة', demised: 'المساحة المؤجرة', unit: 'وحدة', core: 'النواة', stair: 'درج', lifts: 'مصاعد', wc: 'دورات مياه', corridor: 'ممر', note: 'للتوضيح فقط؛ المساحة تقريبية' }
    : { title: 'Demise plan', demised: 'Demised premises', unit: 'Unit', core: 'Core', stair: 'Stair', lifts: 'Lifts', wc: 'WCs', corridor: 'Corridor', note: 'For identification only; area approximate' };
  const area = Math.max(20, Number(d.area_sqm) || 20);
  // The floor is a few times the unit, so neighbours and the core have room.
  const floorArea = Math.max(area * 3.4, 640);
  const Wf = Math.sqrt(floorArea * 1.7); const Hf = floorArea / Wf;
  const W = 760; const ox = 70; const oy = 96;
  const k = (W - ox - 110) / Wf; // pixels per metre
  const H = Math.round(oy + Hf * k + 150);
  const X = (m: number) => (ox + m * k).toFixed(1); const Y = (m: number) => (oy + m * k).toFixed(1); const S = (m: number) => (m * k).toFixed(1);
  // Core in the middle, a 1.8 m corridor round it.
  const cw = Wf * 0.24; const ch = Hf * 0.36; const cx = (Wf - cw) / 2; const cy = (Hf - ch) / 2; const corr = 1.8;
  const leftW = cx - corr; const rightX = cx + cw + corr; const rightW = Wf - rightX;
  const midX = cx - corr; const midW = cw + 2 * corr; const topH = cy - corr; const botY = cy + ch + corr; const botH = Hf - botY;
  // The demised unit at the top of the left block, as tall as its area needs.
  const uh = Math.min(Hf - 4, area / leftW);
  const units: { x: number; y: number; w: number; h: number; demised?: boolean }[] = [
    { x: 0, y: 0, w: leftW, h: uh, demised: true },
    ...(Hf - uh > 4 ? [{ x: 0, y: uh, w: leftW, h: Hf - uh }] : []),
    { x: rightX, y: 0, w: rightW, h: Hf / 2 }, { x: rightX, y: Hf / 2, w: rightW, h: Hf / 2 },
    ...(topH > 3 ? [{ x: midX, y: 0, w: midW, h: topH }] : []),
    ...(botH > 3 ? [{ x: midX, y: botY, w: midW, h: botH }] : []),
  ];
  const seed = [...d.reference].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const floor = 1 + (seed % 9);
  const num = (i: number) => `${floor}.${String(i + 1).padStart(2, '0')}`;
  const ink = '#1c1a16'; const grey = '#8a8378'; const red = '#a3301c'; const paper = '#fffdf8';
  const parts: string[] = [];
  // Column grid: lines every 7.5 m, letters along the top, numbers down the side.
  const step = 7.5;
  for (let i = 0, x = 0; x <= Wf + 0.01; i++, x += step) {
    parts.push(`<line x1="${X(x)}" y1="${(oy - 22).toFixed(1)}" x2="${X(x)}" y2="${Y(Hf)}" stroke="${grey}" stroke-width="0.6" stroke-dasharray="6 4"/>`);
    parts.push(`<circle cx="${X(x)}" cy="${(oy - 34).toFixed(1)}" r="10" fill="${paper}" stroke="${grey}"/><text x="${X(x)}" y="${(oy - 30).toFixed(1)}" text-anchor="middle" font-size="10" fill="${grey}">${String.fromCharCode(65 + (i % 26))}</text>`);
  }
  for (let j = 0, y = 0; y <= Hf + 0.01; j++, y += step) {
    parts.push(`<line x1="${(ox - 22).toFixed(1)}" y1="${Y(y)}" x2="${X(Wf)}" y2="${Y(y)}" stroke="${grey}" stroke-width="0.6" stroke-dasharray="6 4"/>`);
    parts.push(`<circle cx="${(ox - 34).toFixed(1)}" cy="${Y(y)}" r="10" fill="${paper}" stroke="${grey}"/><text x="${(ox - 34).toFixed(1)}" y="${(Number(Y(y)) + 4).toFixed(1)}" text-anchor="middle" font-size="10" fill="${grey}">${j + 1}</text>`);
  }
  // Units: neighbours outlined, the demised unit hatched.
  units.forEach((u, i) => {
    parts.push(`<rect x="${X(u.x)}" y="${Y(u.y)}" width="${S(u.w)}" height="${S(u.h)}" fill="${u.demised ? 'url(#h)' : paper}" stroke="${u.demised ? red : ink}" stroke-width="${u.demised ? 2.4 : 1.2}"/>`);
    const tx = Number(X(u.x + u.w / 2)); const ty = Number(Y(u.y + u.h / 2));
    if (u.demised) {
      parts.push(`<text x="${tx}" y="${ty - 6}" text-anchor="middle" font-size="13" font-weight="600" fill="${ink}" paint-order="stroke" stroke="${paper}" stroke-width="5">${esc(L.demised)}</text>`);
      parts.push(`<text x="${tx}" y="${ty + 12}" text-anchor="middle" font-size="11" fill="${ink}" paint-order="stroke" stroke="${paper}" stroke-width="5">${esc(L.unit)} ${num(i)} · ≈ ${Math.round(area)} m²</text>`);
    } else if (u.w * k > 50 && u.h * k > 26) {
      parts.push(`<text x="${tx}" y="${ty + 4}" text-anchor="middle" font-size="11" fill="${grey}">${esc(L.unit)} ${num(i)}</text>`);
    }
  });
  // Columns at the grid intersections, except inside the core.
  for (let x = 0; x <= Wf + 0.01; x += step) for (let y = 0; y <= Hf + 0.01; y += step) {
    if (x > cx - 0.5 && x < cx + cw + 0.5 && y > cy - 0.5 && y < cy + ch + 0.5) continue;
    parts.push(`<rect x="${(Number(X(x)) - 4).toFixed(1)}" y="${(Number(Y(y)) - 4).toFixed(1)}" width="8" height="8" fill="${ink}"/>`);
  }
  // The core: two stairs at its ends, a bank of three lifts and the WCs between them.
  parts.push(`<rect x="${X(cx)}" y="${Y(cy)}" width="${S(cw)}" height="${S(ch)}" fill="#ece6da" stroke="${ink}" stroke-width="2"/>`);
  const stairH = ch * 0.3; const stairs = [cy, cy + ch - stairH];
  for (const sy of stairs) {
    parts.push(`<rect x="${X(cx)}" y="${Y(sy)}" width="${S(cw)}" height="${S(stairH)}" fill="${paper}" stroke="${ink}" stroke-width="1.2"/>`);
    for (let t = 1; t < 8; t++) parts.push(`<line x1="${X(cx + (cw * t) / 8)}" y1="${Y(sy)}" x2="${X(cx + (cw * t) / 8)}" y2="${Y(sy + stairH)}" stroke="${grey}" stroke-width="0.8"/>`);
    parts.push(`<text x="${X(cx + cw / 2)}" y="${(Number(Y(sy + stairH / 2)) + 4).toFixed(1)}" text-anchor="middle" font-size="10" fill="${ink}" paint-order="stroke" stroke="${paper}" stroke-width="4">${esc(L.stair)}</text>`);
  }
  const liftY = cy + stairH + ch * 0.06; const liftH = ch * 0.2; const liftW = cw / 3.4;
  for (let n = 0; n < 3; n++) {
    const lx = cx + cw * 0.08 + n * (liftW + cw * 0.04);
    parts.push(`<rect x="${X(lx)}" y="${Y(liftY)}" width="${S(liftW)}" height="${S(liftH)}" fill="${paper}" stroke="${ink}"/><line x1="${X(lx)}" y1="${Y(liftY)}" x2="${X(lx + liftW)}" y2="${Y(liftY + liftH)}" stroke="${grey}"/><line x1="${X(lx + liftW)}" y1="${Y(liftY)}" x2="${X(lx)}" y2="${Y(liftY + liftH)}" stroke="${grey}"/>`);
  }
  parts.push(`<text x="${X(cx + cw / 2)}" y="${(Number(Y(liftY + liftH)) + 14).toFixed(1)}" text-anchor="middle" font-size="10" fill="${ink}">${esc(L.lifts)}</text>`);
  parts.push(`<text x="${X(cx + cw / 2)}" y="${(Number(Y(cy + ch - stairH)) - 8).toFixed(1)}" text-anchor="middle" font-size="10" fill="${ink}">${esc(L.wc)}</text>`);
  parts.push(`<text x="${X(cx + cw / 2)}" y="${(Number(Y(cy)) - 6).toFixed(1)}" text-anchor="middle" font-size="9" fill="${grey}" letter-spacing="1">${esc(L.corridor.toUpperCase())}</text>`);
  // Outer walls on top.
  parts.push(`<rect x="${X(0)}" y="${Y(0)}" width="${S(Wf)}" height="${S(Hf)}" fill="none" stroke="${ink}" stroke-width="4"/>`);
  // North arrow and scale bar, clear of the drawing.
  const bar = [5, 10, 20, 25, 50].find((m) => m * k >= 90) ?? 50;
  const nx = W - 46; const ny = oy + 30;
  const bottom = Number(Y(Hf)) + 40;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui, sans-serif">
  <defs><pattern id="h" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#f6e3dc"/><line x1="0" y1="0" x2="0" y2="7" stroke="${red}" stroke-width="1.1"/></pattern></defs>
  <rect width="${W}" height="${H}" fill="${paper}"/>
  <text x="${ar ? W - 30 : ox - 44}" y="30" font-size="18" fill="${ink}" text-anchor="${ar ? 'end' : 'start'}">${esc(L.title)} · <tspan direction="ltr" unicode-bidi="embed">${esc(d.reference)}</tspan></text>
  ${parts.join('\n  ')}
  <g transform="translate(${nx}, ${ny})"><circle r="24" fill="${paper}" stroke="${ink}"/><path d="M0,-18 L7,8 L0,3 L-7,8 Z" fill="${ink}"/><text y="40" text-anchor="middle" font-size="12" font-weight="600" fill="${ink}">N</text></g>
  <g transform="translate(${ox}, ${bottom})"><rect width="${(bar * k / 2).toFixed(1)}" height="6" fill="${ink}"/><rect x="${(bar * k / 2).toFixed(1)}" width="${(bar * k / 2).toFixed(1)}" height="6" fill="${paper}" stroke="${ink}"/><text y="22" font-size="11" fill="${grey}">0</text><text x="${(bar * k).toFixed(1)}" y="22" font-size="11" text-anchor="end" fill="${grey}">${bar} m</text></g>
  <g transform="translate(${ox}, ${bottom + 44})"><line x1="0" y1="-12" x2="${W - ox - 40}" y2="-12" stroke="${ink}"/><text x="${ar ? W - ox - 40 : 0}" text-anchor="${ar ? 'end' : 'start'}" y="6" font-size="12" fill="${ink}">${esc(d.property_name)} · ${esc(d.premises)}</text><text x="${ar ? W - ox - 40 : 0}" text-anchor="${ar ? 'end' : 'start'}" y="24" font-size="11" fill="${grey}">${esc(L.note)}</text></g>
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
