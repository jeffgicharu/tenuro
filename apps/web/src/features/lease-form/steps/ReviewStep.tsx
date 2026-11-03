import { Suspense, type ReactNode } from 'react';
import { useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import { useTheme } from '@mui/material/styles';
import { PenLine } from 'lucide-react';
import { isIsoDate, monthsInTerm, type LeaseFormData, type LeaseFormStep, type PartyData } from '@tenuro/lease-rules';
import { DefinitionList, EmptyNote, SectionHeading, type Definition } from '../../../components/DefinitionList.tsx';
import { Money } from '../../../components/Money.tsx';
import { PropertyLabel } from '../../../components/PropertyPicker.tsx';
import { useFormat } from '../../../i18n/format.ts';
import { annualRentAtStart, diffForms, firstYearPayments, labelKey, type FieldChange } from '../model.ts';
import { FormText } from '../fields.tsx';
import { useForm } from '../state.tsx';

const dash = '—';

export function ReviewStep({ original, onEdit }: { original: LeaseFormData | null; onEdit: (step: LeaseFormStep) => void }) {
  const intl = useIntl();
  const f = useFormat();
  const t = useTheme().tokens;
  const data = useForm().state.data;
  const m = (id: string, values?: Record<string, string | number>) => intl.formatMessage({ id }, values);
  const date = (v: string) => (isIsoDate(v) ? f.date(v, 'long') : v || dash);
  const money = (v: string) => (v.trim() ? <Money value={{ amount: v, currency: data.rent.currency }} /> : dash);
  const pct = (v: string) => (v.trim() ? `${intl.formatNumber(Number(v), { maximumFractionDigits: 4 })}%` : dash);
  const party = (p: PartyData) => [p.name, p.contactName, p.email, p.phone].filter((x) => x.trim()).join(' · ') || dash;
  const months = isIsoDate(data.term.commencementDate) && isIsoDate(data.term.expiryDate) && data.term.expiryDate > data.term.commencementDate
    ? monthsInTerm(data.term.commencementDate, data.term.expiryDate) : null;
  const annual = annualRentAtStart(data);
  const payments = firstYearPayments(data);
  const e = data.rent.escalation;

  const section = (step: LeaseFormStep, items: Definition[], extra?: ReactNode) => (
    <Box component="section" aria-labelledby={`review-${step}`} sx={{ mb: 8 }}>
      <SectionHeading
        id={`review-${step}`}
        action={
          <Button size="small" variant="text" startIcon={<PenLine size={14} />} onClick={() => onEdit(step)} aria-label={m('leaseForm.review.edit', { section: m(`leaseForm.step.${step}`) })}>
            {m('common.edit')}
          </Button>
        }
      >
        {m(`leaseForm.step.${step}`)}
      </SectionHeading>
      {items.length > 0 && <DefinitionList items={items} />}
      {extra}
    </Box>
  );

  return (
    <>
      {original && <ChangesTable changes={diffForms(original, data)} currency={data.rent.currency} />}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 0, mb: 10, border: `1px solid ${t.rule}`, borderRadius: 1, backgroundColor: t.surface }}>
        {[
          { label: m('leaseForm.review.term'), value: months !== null ? m('leaseForm.review.termValue', { months }) : dash },
          { label: m('leaseForm.review.annualRent'), value: annual ? <Money value={{ amount: annual, currency: data.rent.currency }} /> : dash },
          { label: m('leaseForm.field.accounting.discountRatePercent'), value: pct(data.accounting.discountRatePercent) },
        ].map((fig, i) => (
          <Box key={i} sx={{ p: 5, borderInlineStart: { sm: i ? `1px solid ${t.rule}` : 0 }, borderTop: { xs: i ? `1px solid ${t.rule}` : 0, sm: 0 } }}>
            <Box sx={{ fontSize: '0.75rem', color: t.inkSecondary, mb: 1 }}>{fig.label}</Box>
            <Box data-num sx={{ fontFamily: (th) => th.typography.h3.fontFamily, fontSize: '1.375rem', color: t.ink }}>{fig.value}</Box>
          </Box>
        ))}
      </Box>

      {section('parties', [
        { term: m('leaseForm.section.landlord'), value: party(data.parties.landlord) },
        { term: m('leaseForm.section.lessee'), value: data.parties.lesseeEntity || dash },
        ...(data.parties.guarantor ? [{ term: m('leaseForm.section.guarantor'), value: party(data.parties.guarantor) }] : []),
        ...(data.parties.agent ? [{ term: m('leaseForm.section.agent'), value: party(data.parties.agent) }] : []),
      ])}

      {section('property', [
        {
          term: m('leaseForm.field.property.propertyId'),
          value: data.property.propertyId ? <Suspense fallback={<Skeleton width={180} />}><PropertyLabel id={data.property.propertyId} /></Suspense> : dash,
        },
        { term: m('leaseForm.field.property.premises'), value: data.property.premises || dash },
        { term: m('leaseForm.field.property.areaSqm'), value: data.property.areaSqm ? f.area(data.property.areaSqm) : dash },
      ])}

      {section('term', [
        { term: m('leaseForm.field.term.commencementDate'), value: date(data.term.commencementDate) },
        { term: m('leaseForm.field.term.expiryDate'), value: date(data.term.expiryDate) },
      ])}

      {section('rent', [
        { term: m('leaseForm.field.rent.rentPerPeriod'), value: <>{money(data.rent.rentPerPeriod)} <Box component="span" sx={{ color: t.inkSecondary }}>{m(`frequency.perPeriod.${data.rent.paymentFrequency}`)}, {m(`timing.${data.rent.paymentTiming}`).toLowerCase()}</Box></> },
        { term: m('leaseForm.field.rent.serviceChargePerPeriod'), value: money(data.rent.serviceChargePerPeriod) },
        {
          term: m('leaseForm.section.escalation'),
          value: e.kind === 'NONE' ? m('escalation.NONE')
            : `${m(`escalation.${e.kind}`)}${e.kind === 'FIXED' ? ` ${pct(e.ratePercent)}` : e.kind === 'CPI' && e.indexName ? ` (${e.indexName})` : ''} · ${m('leaseForm.field.rent.escalation.everyMonths')} ${e.everyMonths} ${m('leaseForm.field.rent.escalation.everyMonths.unit')} · ${date(e.firstReviewOn)}`,
        },
        ...data.rent.steps.map((s, i) => ({ key: `step${i}`, term: `${m('leaseForm.field.rent.steps.startsOn')} ${date(s.startsOn)}`, value: money(s.rentPerPeriod) })),
      ], payments.length > 0 && (
        <Box sx={{ mt: 5 }}>
          <Box component="h3" sx={{ fontSize: '0.8125rem', fontWeight: 600, color: t.inkSecondary, m: 0, mb: 2 }}>{m('leaseForm.review.firstYear')}</Box>
          <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', '& th, & td': { py: 1.5, borderBottom: `1px solid ${t.rule}`, textAlign: 'start' }, '& th': { color: t.inkSecondary, fontWeight: 500, fontSize: '0.75rem' }, '& .num': { textAlign: 'end' } }}>
            <thead><tr><th scope="col">{m('leaseForm.review.payment')}</th><th scope="col">{m('leaseForm.review.due')}</th><th scope="col" className="num">{m('leaseForm.review.amount')}</th></tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.index}><td data-num>{p.index}</td><td>{f.date(p.dueOn)}</td><td className="num"><Money value={{ amount: p.amount, currency: data.rent.currency }} /></td></tr>
              ))}
            </tbody>
          </Box>
        </Box>
      ))}

      {section('options', data.options.map((o, i) => ({
        key: `o${i}`,
        term: `${String(i + 1).padStart(2, '0')} · ${m(`option.${o.kind}`)}`,
        value: [
          `${m('leaseForm.field.options.exerciseOn')} ${date(o.exerciseOn)}`,
          o.noticeBy ? `${m('leaseForm.field.options.noticeBy')} ${date(o.noticeBy)}` : null,
          o.kind === 'RENEWAL' && o.termMonths ? m('leaseForm.review.termValue', { months: Number(o.termMonths) }) : null,
          o.reasonablyCertain ? m('leaseForm.field.options.reasonablyCertain') : null,
        ].filter(Boolean).join(' · '),
      })), data.options.length === 0 && <EmptyNote>{m('leaseForm.field.options.empty')}</EmptyNote>)}

      {section('deposits', data.deposits.map((d, i) => ({
        key: `d${i}`,
        term: `${String(i + 1).padStart(2, '0')} · ${m(`deposit.${d.kind}`)}`,
        value: <>{money(d.amount)} · {d.heldBy || dash}{d.returnDueOn ? ` · ${date(d.returnDueOn)}` : ''}</>,
      })), data.deposits.length === 0 && <EmptyNote>{m('leaseForm.field.deposits.empty')}</EmptyNote>)}

      {section('accounting', [
        { term: m('leaseForm.field.accounting.standard'), value: `${m(`leaseForm.choice.standard.${data.accounting.standard}`)}${data.accounting.standard === 'ASC842' && data.accounting.asc842Class ? ` · ${m(`leaseForm.choice.class.${data.accounting.asc842Class}`)}` : ''}` },
        { term: m('leaseForm.field.accounting.exemption'), value: m(`leaseForm.choice.exemption.${data.accounting.exemption}`) },
        { term: m('leaseForm.field.accounting.initialDirectCosts'), value: money(data.accounting.initialDirectCosts) },
        { term: m('leaseForm.field.accounting.incentives'), value: money(data.accounting.incentives) },
        { term: m('leaseForm.field.accounting.prepayments'), value: money(data.accounting.prepayments) },
        { term: m('leaseForm.field.accounting.restorationCost'), value: money(data.accounting.restorationCost) },
        ...(data.accounting.costCentre ? [{ term: m('leaseForm.field.accounting.costCentre'), value: data.accounting.costCentre }] : []),
      ])}

      <Box component="section" sx={{ mb: 4 }}>
        <SectionHeading>{m('leaseForm.section.notes')}</SectionHeading>
        <FormText path="notes" multiline optional />
      </Box>
    </>
  );
}

function ChangesTable({ changes, currency }: { changes: FieldChange[]; currency: string }) {
  const intl = useIntl();
  const f = useFormat();
  const t = useTheme().tokens;
  const label = (path: string) => {
    const key = labelKey(path);
    const idx = /\.(\d+)\./.exec(path)?.[1];
    const base = intl.messages[key] ? intl.formatMessage({ id: key }) : path;
    return idx !== undefined ? `${base} (${Number(idx) + 1})` : base;
  };
  const show = (path: string, v: string): ReactNode => {
    if (v === '') return '—';
    if (path === 'property.propertyId') return <Suspense fallback={v}><PropertyLabel id={v} /></Suspense>;
    if (isIsoDate(v)) return f.date(v);
    if (v === 'true') return intl.formatMessage({ id: 'common.yes' });
    if (v === 'false') return intl.formatMessage({ id: 'common.no' });
    if (/^\d+(\.\d+)?$/.test(v) && /(rent|amount|price|Costs|incentives|prepayments|restorationCost|serviceCharge)/i.test(path) && !/Percent|Months/.test(path)) return f.money(v, currency);
    return v;
  };
  return (
    <Box component="section" aria-labelledby="review-changes" sx={{ mb: 10, border: `1px solid ${t.brandSoft}`, borderRadius: 1, backgroundColor: t.brandTint, p: { xs: 4, md: 6 } }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 4, mb: 3 }}>
        <Box component="h2" id="review-changes" sx={{ m: 0, fontFamily: (th) => th.typography.h3.fontFamily, fontSize: '1.2rem', fontWeight: 500 }}>
          {intl.formatMessage({ id: 'leaseForm.review.changes' })}
        </Box>
        {changes.length > 0 && (
          <Box data-num sx={{ fontSize: '0.8125rem', color: t.inkSecondary }}>{intl.formatMessage({ id: 'leaseForm.review.changesCount' }, { count: changes.length })}</Box>
        )}
      </Box>
      {changes.length === 0 ? (
        <Box sx={{ color: t.inkSecondary, fontSize: '0.875rem' }}>{intl.formatMessage({ id: 'leaseForm.review.noChanges' })}</Box>
      ) : (
        <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', '& th, & td': { py: 2, borderBottom: `1px solid ${t.rule}`, textAlign: 'start', verticalAlign: 'top', paddingInlineEnd: 3 }, '& thead th': { color: t.inkSecondary, fontWeight: 500, fontSize: '0.75rem' } }}>
          <thead><tr>
            <th scope="col">{intl.formatMessage({ id: 'leaseForm.review.field' })}</th>
            <th scope="col">{intl.formatMessage({ id: 'leaseForm.review.before' })}</th>
            <th scope="col">{intl.formatMessage({ id: 'leaseForm.review.after' })}</th>
          </tr></thead>
          <tbody>
            {changes.map((c) => (
              <tr key={c.path}>
                <th scope="row" style={{ fontWeight: 500 }}>{label(c.path)}</th>
                <td style={{ color: t.inkSecondary, textDecoration: 'line-through', textDecorationColor: t.ruleStrong }}><bdi>{show(c.path, c.before)}</bdi></td>
                <td style={{ color: t.ink, fontWeight: 500 }}><bdi>{show(c.path, c.after)}</bdi></td>
              </tr>
            ))}
          </tbody>
        </Box>
      )}
    </Box>
  );
}
