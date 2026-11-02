import { fetchQuery, graphql } from 'react-relay';
import type { IntlShape } from 'react-intl';
import { environment } from '../../relay/environment.ts';
import type { Cell, Sheet } from '../../app/xlsx.ts';
import type { reportsLeasesQuery, reportsLeasesQuery$data } from './__generated__/reportsLeasesQuery.graphql';
import type { reportsKeyDatesQuery, reportsKeyDatesQuery$data } from './__generated__/reportsKeyDatesQuery.graphql';
import type { reportsAccountingQuery } from './__generated__/reportsAccountingQuery.graphql';
import type { reportsPortfolioQuery } from './__generated__/reportsPortfolioQuery.graphql';

// Each report gathers its rows from the API on demand (paging through large lists), and returns
// sheets: the first is the report itself, CSV takes that one, Excel takes them all.

export type ReportId = 'register' | 'rentRoll' | 'expiries' | 'keyDates' | 'accounting' | 'locations';
export const REPORTS: ReportId[] = ['register', 'rentRoll', 'expiries', 'keyDates', 'accounting', 'locations'];

type Progress = (done: number, total: number) => void;
const today = () => new Date().toISOString().slice(0, 10);
const plus = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const num = (s: string | null | undefined): Cell => (s === null || s === undefined || s === '' ? null : Number(s));

const leasesQuery = graphql`
  query reportsLeasesQuery($after: String, $filter: LeaseFilter, $orderBy: [LeaseOrder!]) {
    viewer {
      leases(first: 200, after: $after, filter: $filter, orderBy: $orderBy) {
        totalCount
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            reference status propertyName city countryCode propertyType premises landlordName lesseeEntity
            commencementDate expiryDate daysToExpiry termMonths currency paymentFrequency paymentTiming
            rentPerPeriod { amount } serviceChargePerPeriod { amount }
            annualRent { amount currency } annualRentReporting { amount currency }
            areaSqm nextKeyDate nextKeyKind costCentre standard
          }
        }
      }
    }
  }
`;

type LeaseNode = NonNullable<reportsLeasesQuery$data['viewer']>['leases']['edges'][number]['node'];

async function allLeases(filter: reportsLeasesQuery['variables']['filter'], orderBy: reportsLeasesQuery['variables']['orderBy'], progress: Progress): Promise<LeaseNode[]> {
  const out: LeaseNode[] = [];
  let after: string | null = null;
  for (let guard = 0; guard < 100; guard++) {
    const data: reportsLeasesQuery$data | undefined = await fetchQuery<reportsLeasesQuery>(environment, leasesQuery, { after, filter, orderBy }, { fetchPolicy: 'network-only' }).toPromise();
    const c: NonNullable<reportsLeasesQuery$data['viewer']>['leases'] | undefined = data?.viewer?.leases;
    if (!c) break;
    out.push(...c.edges.map((e) => e.node));
    progress(out.length, c.totalCount);
    if (!c.pageInfo.hasNextPage || !c.pageInfo.endCursor) break;
    after = c.pageInfo.endCursor;
  }
  return out;
}

export async function buildReport(id: ReportId, intl: IntlShape, progress: Progress): Promise<Sheet[]> {
  const m = (key: string, values?: Record<string, string | number>) => intl.formatMessage({ id: key }, values);
  const live = { status: ['ACTIVE', 'HOLDING_OVER'] } as const;

  if (id === 'register' || id === 'rentRoll' || id === 'expiries') {
    const filter = id === 'expiries' ? { status: ['ACTIVE', 'HOLDING_OVER'] as const, expiry: { to: plus(730) } } : live;
    const orderBy = id === 'expiries' ? [{ field: 'EXPIRY_DATE', direction: 'ASC' }] as const : [{ field: 'REFERENCE', direction: 'ASC' }] as const;
    const leases = await allLeases(filter as never, orderBy as never, progress);
    const reporting = leases[0]?.annualRentReporting.currency ?? '';
    if (id === 'register') {
      return [{ name: m('reports.register.title'), rows: [
        ['Reference', 'Status', 'Property', 'Premises', 'City', 'Country', 'Type', 'Landlord', 'Lessee entity', 'Commencement', 'Expiry', 'Term (months)', 'Area (m²)', 'Currency', 'Annual rent', `Annual rent (${reporting})`, 'Next key date', 'Next key kind', 'Cost centre', 'Standard'],
        ...leases.map((l) => [l.reference, l.status, l.propertyName, l.premises, l.city, l.countryCode, l.propertyType, l.landlordName, l.lesseeEntity, l.commencementDate, l.expiryDate, l.termMonths, num(l.areaSqm), l.currency, num(l.annualRent.amount), num(l.annualRentReporting.amount), l.nextKeyDate ?? null, l.nextKeyKind ?? null, l.costCentre ?? null, l.standard]),
      ] }];
    }
    if (id === 'rentRoll') {
      const byCurrency = new Map<string, { leases: number; annual: number; reporting: number }>();
      for (const l of leases) { const c = byCurrency.get(l.currency) ?? { leases: 0, annual: 0, reporting: 0 }; c.leases += 1; c.annual += Number(l.annualRent.amount); c.reporting += Number(l.annualRentReporting.amount); byCurrency.set(l.currency, c); }
      return [
        { name: m('reports.rentRoll.title'), rows: [
          ['Reference', 'Property', 'City', 'Landlord', 'Currency', 'Frequency', 'Timing', 'Rent per period', 'Service charge per period', 'Annual rent', `Annual rent (${reporting})`, 'Area (m²)', 'Rent per m² a year', 'Expiry'],
          ...leases.map((l) => [l.reference, l.propertyName, l.city, l.landlordName, l.currency, l.paymentFrequency, l.paymentTiming, num(l.rentPerPeriod.amount), num(l.serviceChargePerPeriod.amount), num(l.annualRent.amount), num(l.annualRentReporting.amount), num(l.areaSqm),
            Number(l.areaSqm) > 0 ? Math.round((Number(l.annualRent.amount) / Number(l.areaSqm)) * 100) / 100 : null, l.expiryDate]),
        ] },
        { name: m('reports.sheet.byCurrency'), rows: [
          ['Currency', 'Leases', 'Annual rent', `Annual rent (${reporting})`],
          ...[...byCurrency.entries()].sort((a, b) => b[1].reporting - a[1].reporting).map(([c, v]) => [c, v.leases, Math.round(v.annual * 100) / 100, Math.round(v.reporting * 100) / 100]),
        ] },
      ];
    }
    return [{ name: m('reports.expiries.title'), rows: [
      ['Expiry', 'Days to expiry', 'Reference', 'Status', 'Property', 'City', 'Landlord', 'Currency', 'Annual rent', `Annual rent (${reporting})`, 'Next key date', 'Next key kind'],
      ...leases.map((l) => [l.expiryDate, l.daysToExpiry, l.reference, l.status, l.propertyName, l.city, l.landlordName, l.currency, num(l.annualRent.amount), num(l.annualRentReporting.amount), l.nextKeyDate ?? null, l.nextKeyKind ?? null]),
    ] }];
  }

  if (id === 'keyDates') {
    const rows: Cell[][] = [['Due', 'Kind', 'Reference', 'Property', 'City', 'Owner', 'Status', 'Reminders (days before)']];
    let after: string | null = null; let total = 0;
    for (let guard = 0; guard < 60; guard++) {
      const data: reportsKeyDatesQuery$data | undefined = await fetchQuery<reportsKeyDatesQuery>(environment, graphql`
        query reportsKeyDatesQuery($after: String, $filter: KeyDateFilter) {
          viewer {
            keyDates(first: 200, after: $after, filter: $filter) {
              totalCount
              pageInfo { hasNextPage endCursor }
              edges { node { dueOn kind status remindDays owner { displayName } lease { reference propertyName city } } }
            }
          }
        }
      `, { after, filter: { from: today(), to: plus(90) } }, { fetchPolicy: 'network-only' }).toPromise();
      const c: NonNullable<reportsKeyDatesQuery$data['viewer']>['keyDates'] | undefined = data?.viewer?.keyDates;
      if (!c) break;
      total = c.totalCount;
      rows.push(...c.edges.map(({ node: k }) => [k.dueOn, m(`keyDate.${k.kind}`), k.lease.reference, k.lease.propertyName, k.lease.city, k.owner?.displayName ?? null, k.status, k.remindDays.join(', ')]));
      progress(rows.length - 1, total);
      if (!c.pageInfo.hasNextPage || !c.pageInfo.endCursor) break;
      after = c.pageInfo.endCursor;
    }
    return [{ name: m('reports.keyDates.title'), rows }];
  }

  if (id === 'accounting') {
    const data = await fetchQuery<reportsAccountingQuery>(environment, graphql`
      query reportsAccountingQuery {
        viewer { accountingSummary {
          year leasesMeasured
          liability { amount currency } currentLiability { amount } rou { amount }
          interestThisYear { amount } depreciationThisYear { amount } leaseCostThisYear { amount } cashThisYear { amount }
          maturity { key amount { amount } }
          byCurrency { leases liability { amount currency } }
        } }
      }
    `, {}, { fetchPolicy: 'network-only' }).toPromise();
    progress(1, 1);
    const s = data?.viewer?.accountingSummary;
    if (!s) return [];
    const cur = s.liability.currency;
    return [
      { name: m('reports.accounting.title'), rows: [
        ['Measure', 'Amount', 'Currency'],
        ['Lease liability', num(s.liability.amount), cur],
        ['Current portion', num(s.currentLiability.amount), cur],
        ['Non-current portion', Math.round((Number(s.liability.amount) - Number(s.currentLiability.amount)) * 100) / 100, cur],
        ['Right-of-use assets', num(s.rou.amount), cur],
        [`Interest ${s.year}`, num(s.interestThisYear.amount), cur],
        [`Depreciation ${s.year}`, num(s.depreciationThisYear.amount), cur],
        [`Operating lease cost ${s.year}`, num(s.leaseCostThisYear.amount), cur],
        [`Lease payments ${s.year}`, num(s.cashThisYear.amount), cur],
        ['Leases measured', s.leasesMeasured, null],
      ] },
      { name: m('reports.sheet.maturity'), rows: [['Band', 'Undiscounted payments', 'Currency'], ...s.maturity.map((b) => [m(`lease.accounting.band.${b.key}`), num(b.amount.amount), cur])] },
      { name: m('reports.sheet.byCurrency'), rows: [['Lease currency', 'Leases', 'Liability (lease currency)'], ...s.byCurrency.map((c) => [c.liability.currency, c.leases, num(c.liability.amount)])] },
    ];
  }

  const data = await fetchQuery<reportsPortfolioQuery>(environment, graphql`
    query reportsPortfolioQuery {
      viewer { portfolio {
        rentByCity { city countryCode rent { leases share passingRent { amount currency } } }
        rentByCountry { countryCode rent { leases share passingRent { amount currency } } }
      } }
    }
  `, {}, { fetchPolicy: 'network-only' }).toPromise();
  progress(1, 1);
  const p = data?.viewer?.portfolio;
  if (!p) return [];
  const cur = p.rentByCountry[0]?.rent.passingRent.currency ?? '';
  return [
    { name: m('reports.locations.title'), rows: [['City', 'Country', 'Leases', `Passing rent (${cur})`, 'Share'], ...p.rentByCity.map((c) => [c.city, c.countryCode, c.rent.leases, num(c.rent.passingRent.amount), num(c.rent.share)])] },
    { name: m('reports.sheet.byCountry'), rows: [['Country', 'Leases', `Passing rent (${cur})`, 'Share'], ...p.rentByCountry.map((c) => [c.countryCode, c.rent.leases, num(c.rent.passingRent.amount), num(c.rent.share)])] },
  ];
}
