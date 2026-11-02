import type { ReactNode } from 'react';
import { graphql, useFragment } from 'react-relay';
import { FormattedMessage, useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import { useTheme } from '@mui/material/styles';
import { BadgeCheck } from 'lucide-react';
import type { LeaseOverview_lease$data, LeaseOverview_lease$key } from './__generated__/LeaseOverview_lease.graphql';
import { DefinitionList, EmptyNote, SectionHeading } from '../../components/DefinitionList.tsx';
import { Money } from '../../components/Money.tsx';
import { useFormat } from '../../i18n/format.ts';

function Section({ id, title, children }: { id: string; title: ReactNode; children: ReactNode }) {
  return (
    <Box component="section" aria-labelledby={id} sx={{ mb: 10 }}>
      <SectionHeading id={id}>{title}</SectionHeading>
      {children}
    </Box>
  );
}

function Escalation({ e }: { e: LeaseOverview_lease$data['escalations'][number] }) {
  const f = useFormat();
  const intl = useIntl();
  if (e.kind === 'FIXED') {
    return <FormattedMessage id="lease.field.escalationFixed" values={{ rate: f.percent(e.rate ?? '0'), months: e.everyMonths, date: f.date(e.firstReviewOn) }} />;
  }
  if (e.kind === 'CPI') {
    const bounds = e.cap || e.collar
      ? intl.formatMessage({ id: 'lease.field.escalationBounds' }, { collar: f.percent(e.collar ?? '0'), cap: f.percent(e.cap ?? '0') })
      : '';
    return <FormattedMessage id="lease.field.escalationCpi" values={{ index: e.indexName ?? intl.formatMessage({ id: 'escalation.CPI' }), months: e.everyMonths, date: f.date(e.firstReviewOn), bounds }} />;
  }
  return <FormattedMessage id="lease.field.escalationMarket" values={{ months: e.everyMonths, date: f.date(e.firstReviewOn) }} />;
}

export function LeaseOverview({ lease: ref }: { lease: LeaseOverview_lease$key }) {
  const lease = useFragment(
    graphql`
      fragment LeaseOverview_lease on Lease {
        premises
        areaSqm
        propertyType
        commencementDate
        expiryDate
        termMonths
        paymentFrequency
        paymentTiming
        rentPerPeriod { amount currency }
        serviceChargePerPeriod { amount currency }
        discountRate
        initialDirectCosts { amount currency }
        incentives { amount currency }
        prepayments { amount currency }
        restorationCost { amount currency }
        usefulLifeMonths
        standard
        asc842Class
        exemption
        costCentre
        notes
        property { name code addressLine city district countryCode yearBuilt areaSqm }
        parties { role name contactName email phone address }
        escalations { kind rate indexName cap collar everyMonths firstReviewOn }
        rentSteps { startsOn rentPerPeriod { amount currency } }
        options { kind exerciseOn noticeBy termMonths price { amount currency } reasonablyCertain status terms }
        deposits { kind amount { amount currency } heldBy returnDueOn status }
      }
    `,
    ref,
  );
  const intl = useIntl();
  const f = useFormat();
  const t = useTheme().tokens;
  const country = new Intl.DisplayNames([intl.locale], { type: 'region' }).of(lease.property.countryCode) ?? lease.property.countryCode;
  const perPeriod = intl.formatMessage({ id: `frequency.perPeriod.${lease.paymentFrequency}` });

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, columnGap: 10 }}>
      <Box>
        <Section id="ov-parties" title={<FormattedMessage id="lease.section.parties" />}>
          <DefinitionList
            items={lease.parties.map((p, i) => ({
              key: `${p.role}-${i}`,
              term: <FormattedMessage id={`party.${p.role}`} />,
              value: (
                <Box>
                  <Box sx={{ fontWeight: 500 }}>{p.name}</Box>
                  {(p.contactName || p.email || p.phone) && (
                    <Box sx={{ color: t.inkSecondary, fontSize: '0.8125rem', mt: 0.5 }}>
                      {[p.contactName, p.email, p.phone].filter(Boolean).map((x, j) => (
                        <Box key={j} component="span" sx={{ display: 'block' }}><bdi>{x}</bdi></Box>
                      ))}
                    </Box>
                  )}
                </Box>
              ),
            }))}
          />
        </Section>

        <Section id="ov-premises" title={<FormattedMessage id="lease.section.premises" />}>
          <DefinitionList
            items={[
              { term: <FormattedMessage id="lease.field.property" />, value: <>{lease.property.name} <Box component="span" sx={{ color: t.inkTertiary, fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.75rem' }}><bdi>{lease.property.code}</bdi></Box></> },
              { term: <FormattedMessage id="lease.field.address" />, value: intl.formatList([lease.property.addressLine, lease.property.district, lease.property.city, country].filter((x): x is string => Boolean(x)), { type: 'unit', style: 'short' }) },
              { term: <FormattedMessage id="lease.field.premises" />, value: lease.premises },
              { term: <FormattedMessage id="lease.field.type" />, value: <FormattedMessage id={`propertyType.${lease.propertyType}`} /> },
              { term: <FormattedMessage id="lease.field.area" />, value: <span data-num>{f.area(lease.areaSqm)}</span> },
              ...(lease.property.yearBuilt ? [{ term: <FormattedMessage id="lease.field.yearBuilt" />, value: <span data-num>{lease.property.yearBuilt}</span> }] : []),
            ]}
          />
        </Section>

        <Section id="ov-deposits" title={<FormattedMessage id="lease.section.deposits" />}>
          {lease.deposits.length === 0 ? <EmptyNote><FormattedMessage id="lease.deposits.none" /></EmptyNote> : (
            <DefinitionList
              items={lease.deposits.map((d, i) => ({
                key: String(i),
                term: <FormattedMessage id={`deposit.${d.kind}`} />,
                value: (
                  <Box>
                    <Money value={d.amount} sx={{ fontWeight: 500 }} />
                    <Box sx={{ color: t.inkSecondary, fontSize: '0.8125rem', mt: 0.5 }}>
                      {d.heldBy} · <FormattedMessage id={`depositStatus.${d.status}`} />
                      {d.returnDueOn && <> · <FormattedMessage id="lease.deposits.returnBy" values={{ date: f.date(d.returnDueOn) }} /></>}
                    </Box>
                  </Box>
                ),
              }))}
            />
          )}
        </Section>
      </Box>

      <Box>
        <Section id="ov-term" title={<FormattedMessage id="lease.section.term" />}>
          <DefinitionList
            items={[
              { term: <FormattedMessage id="lease.field.commencement" />, value: f.date(lease.commencementDate, 'long') },
              { term: <FormattedMessage id="lease.field.expiry" />, value: f.date(lease.expiryDate, 'long') },
              { term: <FormattedMessage id="lease.field.termMonths" />, value: <FormattedMessage id="lease.field.months" values={{ count: lease.termMonths }} /> },
            ]}
          />
          {lease.options.length === 0 ? <EmptyNote><FormattedMessage id="lease.options.none" /></EmptyNote> : (
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {lease.options.map((o, i) => (
                <Box component="li" key={i} sx={{ py: 3, borderBottom: `1px solid ${t.rule}` }}>
                  <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 3 }}>
                    <Box sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
                      <FormattedMessage id={`option.${o.kind}`} />{' '}
                      <Box component="span" sx={{ fontWeight: 400, color: t.inkSecondary }}>
                        {f.date(o.exerciseOn)}
                        {o.termMonths ? <> · <FormattedMessage id="lease.options.term" values={{ months: o.termMonths }} /></> : null}
                        {o.price ? <> · <Money value={o.price} /></> : null}
                      </Box>
                    </Box>
                    <Box sx={{ fontSize: '0.75rem', color: t.inkSecondary, whiteSpace: 'nowrap' }}><FormattedMessage id={`optionStatus.${o.status}`} /></Box>
                  </Box>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, mt: 1, fontSize: '0.8125rem', color: t.inkSecondary }}>
                    {o.noticeBy && <span><FormattedMessage id="lease.options.notice" values={{ date: f.date(o.noticeBy) }} /></span>}
                    {o.reasonablyCertain && (
                      <Tooltip title={<FormattedMessage id="lease.options.certainHelp" />}>
                        <Box component="span" tabIndex={0} sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, color: t.brand, fontWeight: 500 }}>
                          <BadgeCheck size={14} aria-hidden /> <FormattedMessage id="lease.options.certain" />
                        </Box>
                      </Tooltip>
                    )}
                  </Box>
                  {o.terms && <Box sx={{ mt: 1.5, fontSize: '0.8125rem', color: t.inkSecondary }}>{o.terms}</Box>}
                </Box>
              ))}
            </Box>
          )}
        </Section>

        <Section id="ov-rent" title={<FormattedMessage id="lease.section.rent" />}>
          <DefinitionList
            items={[
              { term: <FormattedMessage id="lease.field.frequency" />, value: intl.formatList([intl.formatMessage({ id: `frequency.${lease.paymentFrequency}` }), intl.formatMessage({ id: `timing.${lease.paymentTiming}` })], { type: 'unit', style: 'short' }) },
              { term: <FormattedMessage id="lease.field.rentPerPeriod" />, value: <><Money value={lease.rentPerPeriod} sx={{ fontWeight: 500 }} /> {perPeriod}</> },
              ...(Number(lease.serviceChargePerPeriod.amount) > 0 ? [{ term: <FormattedMessage id="lease.field.serviceCharge" />, value: <><Money value={lease.serviceChargePerPeriod} /> {perPeriod}</> }] : []),
              {
                term: <FormattedMessage id="lease.field.escalation" />,
                value: lease.escalations.length ? lease.escalations.map((e, i) => <Box key={i}><Escalation e={e} /></Box>) : <FormattedMessage id="escalation.NONE" />,
              },
              ...(lease.rentSteps.length ? [{
                term: <FormattedMessage id="lease.field.steps" />,
                value: (
                  <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}>
                    {lease.rentSteps.map((s, i) => (
                      <Box component="li" key={i} sx={{ display: 'flex', justifyContent: 'space-between', gap: 3 }}>
                        <span>{f.date(s.startsOn)}</span><Money value={s.rentPerPeriod} />
                      </Box>
                    ))}
                  </Box>
                ),
              }] : []),
            ]}
          />
        </Section>

        <Section id="ov-accounting" title={<FormattedMessage id="lease.section.accounting" />}>
          <DefinitionList
            items={[
              { term: <FormattedMessage id="lease.field.standard" />, value: <><FormattedMessage id={`lease.standard.${lease.standard}`} />{lease.asc842Class ? ` · ${lease.asc842Class.toLowerCase()}` : ''}</> },
              { term: <FormattedMessage id="lease.field.discountRate" />, value: <span data-num>{f.percent(lease.discountRate, 3)}</span> },
              { term: <FormattedMessage id="lease.field.idc" />, value: <Money value={lease.initialDirectCosts} /> },
              { term: <FormattedMessage id="lease.field.incentives" />, value: <Money value={lease.incentives} /> },
              { term: <FormattedMessage id="lease.field.prepayments" />, value: <Money value={lease.prepayments} /> },
              { term: <FormattedMessage id="lease.field.restoration" />, value: <Money value={lease.restorationCost} /> },
              ...(lease.usefulLifeMonths ? [{ term: <FormattedMessage id="lease.field.usefulLife" />, value: <FormattedMessage id="lease.field.months" values={{ count: lease.usefulLifeMonths }} /> }] : []),
              { term: <FormattedMessage id="lease.field.exemption" />, value: <FormattedMessage id={`lease.exemption.${lease.exemption}`} /> },
              ...(lease.costCentre ? [{ term: <FormattedMessage id="lease.field.costCentre" />, value: <Box component="bdi" sx={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem' }}>{lease.costCentre}</Box> }] : []),
            ]}
          />
        </Section>

        <Section id="ov-notes" title={<FormattedMessage id="lease.section.notes" />}>
          {lease.notes ? <Box sx={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem' }}>{lease.notes}</Box> : <EmptyNote><FormattedMessage id="lease.notes.none" /></EmptyNote>}
        </Section>
      </Box>
    </Box>
  );
}
