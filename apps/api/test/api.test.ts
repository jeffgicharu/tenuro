import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../src/config.ts';
import { localId, prepareDatabase, startApp, Visitor, type TestApp } from './harness.ts';

let app: TestApp;

beforeAll(async () => {
  await prepareDatabase();
  app = await startApp();
}, 120_000);

afterAll(async () => {
  await app?.close();
});

const LEASE_FIELDS = 'id reference version annualRent { amount currency } rentPerPeriod { amount } expiryDate changedInSandbox formData';

async function firstLease(v: Visitor, filter = '{ status: [ACTIVE] }') {
  const r = await v.gql<{ viewer: { leases: { edges: { node: { id: string; reference: string; version: number; formData: string; rentPerPeriod: { amount: string } } }[] } } }>(
    `{ viewer { leases(first: 1, filter: ${filter}, orderBy: [{ field: REFERENCE, direction: ASC }]) { edges { node { ${LEASE_FIELDS} } } } } }`);
  return r.data!.viewer.leases.edges[0]!.node;
}

// Converts stored form data into the typed LeaseInput the API expects.
function toInput(formJson: string, patch: (f: Record<string, any>) => void = () => {}) {
  const f = JSON.parse(formJson);
  patch(f);
  const blank = (v: string) => (v === '' ? null : v);
  const party = (p: any) => (p ? { name: p.name, contactName: blank(p.contactName), email: blank(p.email), phone: blank(p.phone) } : null);
  const e = f.rent.escalation;
  return {
    landlord: party(f.parties.landlord), lesseeEntity: f.parties.lesseeEntity, guarantor: party(f.parties.guarantor), agent: party(f.parties.agent),
    propertyId: f.property.propertyId, premises: f.property.premises, areaSqm: f.property.areaSqm,
    commencementDate: f.term.commencementDate, expiryDate: f.term.expiryDate,
    currency: f.rent.currency, paymentFrequency: f.rent.paymentFrequency, paymentTiming: f.rent.paymentTiming,
    rentPerPeriod: f.rent.rentPerPeriod, serviceChargePerPeriod: blank(f.rent.serviceChargePerPeriod),
    escalation: e.kind === 'NONE' ? null : {
      kind: e.kind, ratePercent: blank(e.ratePercent), everyMonths: Number(e.everyMonths), firstReviewOn: e.firstReviewOn,
      indexName: blank(e.indexName), capPercent: blank(e.capPercent), collarPercent: blank(e.collarPercent),
    },
    rentSteps: f.rent.steps,
    options: f.options.map((o: any) => ({ kind: o.kind, exerciseOn: o.exerciseOn, noticeBy: blank(o.noticeBy), termMonths: o.termMonths ? Number(o.termMonths) : null, price: blank(o.price), reasonablyCertain: o.reasonablyCertain, terms: blank(o.terms) })),
    deposits: f.deposits.map((d: any) => ({ kind: d.kind, amount: d.amount, heldBy: d.heldBy, returnDueOn: blank(d.returnDueOn) })),
    accounting: {
      discountRatePercent: f.accounting.discountRatePercent, initialDirectCosts: blank(f.accounting.initialDirectCosts), incentives: blank(f.accounting.incentives),
      prepayments: blank(f.accounting.prepayments), restorationCost: blank(f.accounting.restorationCost),
      usefulLifeMonths: f.accounting.usefulLifeMonths ? Number(f.accounting.usefulLifeMonths) : null, ownershipTransfers: f.accounting.ownershipTransfers,
      standard: f.accounting.standard, asc842Class: blank(f.accounting.asc842Class), exemption: f.accounting.exemption,
    },
    costCentre: blank(f.accounting.costCentre), notes: blank(f.notes),
  };
}

const AMEND = `mutation($input: AmendLeaseInput!) { amendLease(input: $input) {
  __typename
  ... on MutationAmendLeaseSuccess { data { lease { ${LEASE_FIELDS} } } }
  ... on DomainError { message }
  ... on ValidationFailed { fieldErrors { path code step } }
  ... on StaleVersion { currentVersion }
  ... on PermissionDenied { requiredRole }
  ... on QuotaExceeded { limit }
} }`;

describe('sessions', () => {
  it('has no viewer before sign-in and lists nine sign-in accounts', async () => {
    const v = new Visitor(app);
    const r = await v.gql<{ viewer: null; signInAccounts: unknown[] }>('{ viewer { canEdit } signInAccounts { id } }');
    expect(r.data!.viewer).toBeNull();
    expect(r.data!.signInAccounts).toHaveLength(9);
  });

  it('signs in with one click and keeps the sandbox when switching role', async () => {
    const v = new Visitor(app);
    expect(await v.signIn('mbuyu-court', 'MANAGER')).toBe(204);
    const first = await v.sandboxId();
    expect(await v.signIn('mbuyu-court', 'VIEWER')).toBe(204);
    expect(await v.sandboxId()).toBe(first);
    const r = await v.gql<{ viewer: { user: { role: string }; canEdit: boolean } }>('{ viewer { user { role } canEdit } }');
    expect(r.data!.viewer).toEqual({ user: { role: 'VIEWER' }, canEdit: false });
  });

  it('refuses GraphQL posts without the client header', async () => {
    const res = await fetch(`${app.url}/graphql`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"query":"{ viewer { canEdit } }"}' });
    expect(res.status).toBe(400);
  });
});

describe('property search', () => {
  it('lists buildings whose name matches before those matching only on their address', async () => {
    const v = new Visitor(app);
    await v.signIn('mbuyu-court', 'MANAGER');
    type R = { viewer: { properties: { edges: { node: { name: string; addressLine: string } }[] } } };
    const all = await v.gql<R>('{ viewer { properties(first: 50) { edges { node { name addressLine } } } } }');
    // A coined root used both in building names and in street names.
    const roots = all.data!.viewer.properties.edges.map((e) => e.node.name.split(' ')[0]!);
    const root = roots.find((r) => all.data!.viewer.properties.edges.some((e) => e.node.addressLine.includes(r))) ?? roots[0]!;
    const r = await v.gql<R>('query($s: String) { viewer { properties(first: 50, search: $s) { edges { node { name addressLine } } } } }', { s: root });
    const nameMatches = r.data!.viewer.properties.edges.map((e) => e.node.name.toLowerCase().includes(root.toLowerCase()));
    expect(nameMatches[0]).toBe(true);
    const firstMiss = nameMatches.indexOf(false);
    if (firstMiss !== -1) expect(nameMatches.slice(firstMiss).every((m) => !m)).toBe(true);
  });
});

describe('lease register', () => {
  it('pages with stable cursors and a total that matches the filter', async () => {
    const v = new Visitor(app);
    await v.signIn('mbuyu-court', 'VIEWER');
    const q = `query($after: String) { viewer { leases(first: 25, after: $after, orderBy: [{ field: EXPIRY_DATE, direction: ASC }]) {
      totalCount pageInfo { hasNextPage endCursor } edges { node { id expiryDate } } } } }`;
    type Page = { viewer: { leases: { totalCount: number; pageInfo: { hasNextPage: boolean; endCursor: string }; edges: { node: { id: string; expiryDate: string } }[] } } };
    const p1 = (await v.gql<Page>(q)).data!.viewer.leases;
    const p2 = (await v.gql<Page>(q, { after: p1.pageInfo.endCursor })).data!.viewer.leases;
    expect(p1.totalCount).toBe(300);
    expect(p1.edges).toHaveLength(25);
    const ids = [...p1.edges, ...p2.edges].map((e) => e.node.id);
    expect(new Set(ids).size).toBe(50);
    const dates = [...p1.edges, ...p2.edges].map((e) => e.node.expiryDate);
    expect([...dates].sort()).toEqual(dates);
  });

  it('applies several filters at once and sorts by reporting rent', async () => {
    const v = new Visitor(app);
    await v.signIn('mbuyu-court', 'VIEWER');
    type R = { viewer: { leases: { totalCount: number; edges: { node: { status: string; countryCode: string; propertyType: string; annualRentReporting: { amount: string } } }[] } } };
    const r = await v.gql<R>(`{ viewer { leases(first: 50, filter: { status: [ACTIVE, HOLDING_OVER], countryCode: ["KE", "UG"], propertyType: [OFFICE, RETAIL] },
      orderBy: [{ field: ANNUAL_RENT, direction: DESC }]) { totalCount edges { node { status countryCode propertyType annualRentReporting { amount } } } } } }`);
    const rows = r.data!.viewer.leases.edges.map((e) => e.node);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(['ACTIVE', 'HOLDING_OVER']).toContain(row.status);
      expect(['KE', 'UG']).toContain(row.countryCode);
      expect(['OFFICE', 'RETAIL']).toContain(row.propertyType);
    }
    const rents = rows.map((x) => Number(x.annualRentReporting.amount));
    expect([...rents].sort((a, b) => b - a)).toEqual(rents);
  });

  it('treats search text literally', async () => {
    const v = new Visitor(app);
    await v.signIn('mbuyu-court', 'VIEWER');
    const r = await v.gql<{ viewer: { leases: { totalCount: number } } }>('{ viewer { leases(first: 1, filter: { search: "%" }) { totalCount } } }');
    expect(r.data!.viewer.leases.totalCount).toBe(0);
  });

  it('keeps each company’s leases invisible to the others', async () => {
    const a = new Visitor(app);
    await a.signIn('halvard-crane', 'ADMIN');
    const lease = await firstLease(a);
    const b = new Visitor(app);
    await b.signIn('mbuyu-court', 'ADMIN');
    const r = await b.gql<{ node: null }>('query($id: ID!) { node(id: $id) { id } }', { id: lease.id });
    expect(r.data!.node).toBeNull();
  });
});

describe('permissions are enforced in the API', () => {
  it('blocks a viewer from amending a lease or creating a task', async () => {
    const v = new Visitor(app);
    await v.signIn('mbuyu-court', 'VIEWER');
    const lease = await firstLease(v);
    const amend = await v.gql<{ amendLease: { __typename: string; requiredRole: string } }>(AMEND, {
      input: { id: lease.id, version: lease.version, lease: toInput(lease.formData, (f) => { f.notes = 'viewer edit'; }) },
    });
    expect(amend.data!.amendLease).toMatchObject({ __typename: 'PermissionDenied', requiredRole: 'MANAGER' });
    const task = await v.gql<{ createTask: { __typename: string } }>(
      'mutation($input: CreateTaskInput!) { createTask(input: $input) { __typename } }', { input: { title: 'Nope', leaseId: lease.id } });
    expect(task.data!.createTask.__typename).toBe('PermissionDenied');
  });

  it('lets anyone save a personal view but only an admin share one', async () => {
    const save = (v: Visitor, shared: boolean) => v.gql<{ saveView: { __typename: string } }>(
      'mutation($input: SaveViewInput!) { saveView(input: $input) { __typename } }',
      { input: { scope: 'LEASE_REGISTER', name: 'Mine', config: '{"filters":{}}', shared } });
    const viewer = new Visitor(app);
    await viewer.signIn('sunbula', 'VIEWER');
    expect((await save(viewer, false)).data!.saveView.__typename).toBe('MutationSaveViewSuccess');
    expect((await save(viewer, true)).data!.saveView.__typename).toBe('PermissionDenied');
    const manager = new Visitor(app);
    await manager.signIn('sunbula', 'MANAGER');
    expect((await save(manager, true)).data!.saveView.__typename).toBe('PermissionDenied');
    const admin = new Visitor(app);
    await admin.signIn('sunbula', 'ADMIN');
    expect((await save(admin, true)).data!.saveView.__typename).toBe('MutationSaveViewSuccess');
  });
});

describe('visitor sandboxes', () => {
  it('shows an amendment only to the visitor who made it and leaves the base data untouched', async () => {
    const a = new Visitor(app);
    await a.signIn('mbuyu-court', 'MANAGER');
    const lease = await firstLease(a);
    const before = lease.rentPerPeriod.amount;
    const r = await a.gql<{ amendLease: { __typename: string; data: { lease: { rentPerPeriod: { amount: string }; version: number; changedInSandbox: boolean; id: string } } } }>(AMEND, {
      input: { id: lease.id, version: lease.version, lease: toInput(lease.formData, (f) => { f.rent.rentPerPeriod = '999000'; }) },
    });
    expect(r.data!.amendLease.__typename).toBe('MutationAmendLeaseSuccess');
    const amended = r.data!.amendLease.data.lease;
    expect(amended).toMatchObject({ id: lease.id, version: lease.version + 1, changedInSandbox: true, rentPerPeriod: { amount: '999000' } });

    const b = new Visitor(app);
    await b.signIn('mbuyu-court', 'MANAGER');
    const seenByB = await b.gql<{ node: { rentPerPeriod: { amount: string }; changedInSandbox: boolean } }>(
      'query($id: ID!) { node(id: $id) { ... on Lease { rentPerPeriod { amount } changedInSandbox } } }', { id: lease.id });
    expect(seenByB.data!.node).toEqual({ rentPerPeriod: { amount: before }, changedInSandbox: false });

    const base = await app.owner.selectFrom('lease').select('rent_per_period').where('id', '=', localId(lease.id)).executeTakeFirstOrThrow();
    expect(Number(base.rent_per_period)).toBe(Number(before));

    const activity = await a.gql<{ node: { activity: { edges: { node: { verb: string; diff: string } }[] } } }>(
      'query($id: ID!) { node(id: $id) { ... on Lease { activity(first: 1) { edges { node { verb diff } } } } } }', { id: lease.id });
    const latest = activity.data!.node.activity.edges[0]!.node;
    expect(latest.verb).toBe('LEASE_AMENDED');
    expect(JSON.parse(latest.diff)).toContainEqual({ field: 'rent.rentPerPeriod', from: expect.any(String), to: '999000' });
  });

  it('rejects an amendment made from an out-of-date version', async () => {
    const a = new Visitor(app);
    await a.signIn('mbuyu-court', 'MANAGER');
    const lease = await firstLease(a, '{ status: [ACTIVE], countryCode: ["TZ"] }');
    const input = (notes: string, version: number) => ({ id: lease.id, version, lease: toInput(lease.formData, (f) => { f.notes = notes; }) });
    expect((await a.gql<{ amendLease: { __typename: string } }>(AMEND, { input: input('first', lease.version) })).data!.amendLease.__typename).toBe('MutationAmendLeaseSuccess');
    const stale = await a.gql<{ amendLease: { __typename: string; currentVersion: number } }>(AMEND, { input: input('second', lease.version) });
    expect(stale.data!.amendLease).toEqual({ __typename: 'StaleVersion', message: expect.any(String), currentVersion: lease.version + 1 });
  });

  it('returns field errors tagged with their form step', async () => {
    const a = new Visitor(app);
    await a.signIn('mbuyu-court', 'MANAGER');
    const lease = await firstLease(a);
    const r = await a.gql<{ amendLease: { __typename: string; fieldErrors: { path: string; code: string; step: string }[] } }>(AMEND, {
      input: { id: lease.id, version: lease.version, lease: toInput(lease.formData, (f) => { f.term.expiryDate = '2001-01-01'; }) },
    });
    expect(r.data!.amendLease.__typename).toBe('ValidationFailed');
    expect(r.data!.amendLease.fieldErrors).toContainEqual({ path: 'term.expiryDate', code: 'date_before', step: 'term' });
  });

  it('creates a lease that appears in the register with key dates, then resets cleanly', async () => {
    const a = new Visitor(app);
    await a.signIn('halvard-crane', 'MANAGER');
    const lease = await firstLease(a);
    const total = async () => (await a.gql<{ viewer: { leases: { totalCount: number } } }>('{ viewer { leases(first: 1) { totalCount } } }')).data!.viewer.leases.totalCount;
    const startCount = await total();
    const r = await a.gql<{ submitLease: { __typename: string; data: { lease: { id: string; reference: string; keyDates: { totalCount: number } } } } }>(
      `mutation($input: SubmitLeaseInput!) { submitLease(input: $input) { __typename
        ... on MutationSubmitLeaseSuccess { data { lease { id reference keyDates(first: 10) { totalCount } } } }
        ... on ValidationFailed { fieldErrors { path code } } } }`,
      { input: { lease: toInput(lease.formData, (f) => { f.term = { commencementDate: '2026-07-01', expiryDate: '2036-06-30' }; f.options = []; f.rent.steps = []; f.rent.escalation = { kind: 'NONE', ratePercent: '', everyMonths: '12', firstReviewOn: '', indexName: '', capPercent: '', collarPercent: '' }; }) } });
    expect(r.data!.submitLease.__typename).toBe('MutationSubmitLeaseSuccess');
    expect(r.data!.submitLease.data.lease.keyDates.totalCount).toBeGreaterThanOrEqual(1);
    expect(await total()).toBe(startCount + 1);

    const reset = await a.gql<{ resetMySandbox: { __typename: string } }>('mutation { resetMySandbox { __typename } }');
    expect(reset.data!.resetMySandbox.__typename).toBe('MutationResetMySandboxSuccess');
    expect(await total()).toBe(startCount);
  });
});

describe('limits on what visitors can create', () => {
  it('stops a sandbox at its write quota', async () => {
    const a = new Visitor(app);
    await a.signIn('mbuyu-court', 'MANAGER');
    await app.owner.updateTable('sandbox').set({ write_count: config.limits.sandboxWrites }).where('id', '=', await a.sandboxId()).execute();
    const r = await a.gql<{ createTask: { __typename: string; limit: string } }>(
      'mutation($input: CreateTaskInput!) { createTask(input: $input) { __typename ... on QuotaExceeded { limit } } }', { input: { title: 'One more' } });
    expect(r.data!.createTask).toEqual({ __typename: 'QuotaExceeded', limit: 'sandbox-writes' });
  });

  it('refuses writes once all sandboxes together reach the global overlay cap', async () => {
    const a = new Visitor(app);
    await a.signIn('mbuyu-court', 'MANAGER');
    const filler = new Visitor(app);
    await filler.signIn('mbuyu-court', 'VIEWER');
    await app.owner.updateTable('sandbox').set({ write_count: config.limits.maxOverlayRows }).where('id', '=', await filler.sandboxId()).execute();
    const r = await a.gql<{ createTask: { __typename: string; limit: string } }>(
      'mutation($input: CreateTaskInput!) { createTask(input: $input) { __typename ... on QuotaExceeded { limit } } }', { input: { title: 'Over the cap' } });
    expect(r.data!.createTask).toEqual({ __typename: 'QuotaExceeded', limit: 'overlay-total' });
    await app.owner.updateTable('sandbox').set({ write_count: 0 }).where('id', '=', await filler.sandboxId()).execute();
  });

  it('limits new sandboxes per address per day, even when the cookie is dropped', async () => {
    const ip = '203.0.113.9';
    const statuses: number[] = [];
    for (let i = 0; i <= config.limits.newSandboxesPerIpPerDay; i++) statuses.push(await new Visitor(app, ip).signIn('sunbula', 'VIEWER'));
    expect(statuses.slice(0, -1).every((s) => s === 204)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });

  it('limits new sessions per address per hour', async () => {
    const v = new Visitor(app, '203.0.113.77');
    const statuses: number[] = [];
    for (let i = 0; i <= config.limits.newSessionsPerIpPerHour; i++) statuses.push(await v.signIn('sunbula', 'VIEWER'));
    expect(statuses.filter((s) => s === 204)).toHaveLength(config.limits.newSessionsPerIpPerHour);
    expect(statuses.at(-1)).toBe(429);
  });

  it('caps the global number of live sessions', async () => {
    const v = new Visitor(app, '198.51.100.1');
    const user = await app.owner.selectFrom('app_user').select('id').where('listed_for_sign_in', '=', true).executeTakeFirstOrThrow();
    await app.owner.insertInto('session').values(Array.from({ length: config.limits.maxSessions }, (_, i) => ({
      token_hash: `filler-${i}`, user_id: user.id, sandbox_id: null, ip_hash: 'filler', expires_at: '2099-01-01T00:00:00Z',
    }))).execute();
    expect(await v.signIn('sunbula', 'VIEWER')).toBe(429);
    await app.owner.deleteFrom('session').where('token_hash', 'like', 'filler-%').execute();
  });
});

describe('maintenance', () => {
  it('removes idle sandboxes together with their overlay rows', async () => {
    const a = new Visitor(app);
    await a.signIn('mbuyu-court', 'MANAGER');
    await a.gql('mutation($input: CreateTaskInput!) { createTask(input: $input) { __typename } }', { input: { title: 'Left behind' } });
    const sandboxId = await a.sandboxId();
    await app.owner.updateTable('session').set({ last_seen_at: '2020-01-01T00:00:00Z', expires_at: '2020-01-02T00:00:00Z' }).where('sandbox_id', '=', sandboxId).execute();
    await app.owner.updateTable('sandbox').set({ last_active_at: '2020-01-01T00:00:00Z' }).where('id', '=', sandboxId).execute();
    const { sweep } = await import('../src/maintenance.ts');
    const result = await sweep(app.db);
    expect(result.sandboxes).toBeGreaterThanOrEqual(1);
    const left = await app.owner.selectFrom('task').select('id').where('sandbox_id', '=', sandboxId).execute();
    expect(left).toEqual([]);
  });
});

describe('restore integrity check', () => {
  it('passes on the data a rebuild wrote, and names what changed when something is altered', async () => {
    const { sql } = await import('kysely');
    const check = async () => (await sql<{ v: string }>`SELECT ops.verify_integrity() AS v`.execute(app.owner)).rows[0]!.v;
    expect(await check()).toBe('ok');
    const lease = await app.owner.selectFrom('lease').select(['id', 'rent_per_period']).where('sandbox_id', 'is', null).executeTakeFirstOrThrow();
    await app.owner.updateTable('lease').set({ rent_per_period: '1' }).where('id', '=', lease.id).execute();
    expect(await check()).toBe('lease rent checksum differs from the manifest');
    await app.owner.updateTable('lease').set({ rent_per_period: lease.rent_per_period }).where('id', '=', lease.id).execute();
    expect(await check()).toBe('ok');
  });
});

describe('query limits', () => {
  it('rejects too many aliases', async () => {
    const v = new Visitor(app);
    const fields = Array.from({ length: 16 }, (_, i) => `a${i}: signInAccounts { id }`).join(' ');
    const r = await v.gql(`{ ${fields} }`);
    expect(r.errors?.[0]?.message).toMatch(/Too many aliases/);
  });

  it('rejects queries deeper than the limit', async () => {
    const v = new Visitor(app);
    await v.signIn('mbuyu-court', 'VIEWER');
    const deep = '{ viewer { leases(first: 1) { edges { node { keyDates(first: 1) { edges { node { lease { keyDates(first: 1) { edges { node { lease { keyDates(first: 1) { edges { node { id } } } } } } } } } } } } } } } }';
    const r = await v.gql(deep);
    expect(r.errors?.[0]?.message).toMatch(/depth|complex/i);
  });
});

describe('portfolio dashboard', () => {
  const PORTFOLIO = `{ viewer { tenant { reportingCurrency } portfolio {
    liveLeases passingRent { amount currency } wault holdingOver expiringIn12Months keyDatesDue overdueKeyDates
    expiryProfile { year from leases passingRent { amount } }
    rentByCountry { countryCode rent { leases share passingRent { amount } } }
    rentByType { propertyType rent { leases share } }
    rentByCity { city countryCode latitude longitude rent { leases share } }
    upcomingKeyDates(first: 5) { dueOn daysUntil lease { reference } }
    keyDateWeeks { start count }
    attentionBuckets { withinDays fromDays count rentAtStake { amount } }
    attention(first: 6) { hasOpenTask rentAtStake { amount } keyDate { kind dueOn status } }
    recentActivity(first: 5) { createdAt summary lease { reference } }
  } } }`;
  type P = {
    viewer: { tenant: { reportingCurrency: string }; portfolio: {
      liveLeases: number; passingRent: { amount: string; currency: string }; wault: string | null; holdingOver: number;
      expiringIn12Months: number; keyDatesDue: number; overdueKeyDates: number;
      expiryProfile: { year: number | null; from: number; leases: number; passingRent: { amount: string } }[];
      rentByCountry: { countryCode: string; rent: { leases: number; share: string; passingRent: { amount: string } } }[];
      rentByType: { propertyType: string; rent: { leases: number; share: string } }[];
      rentByCity: { city: string; countryCode: string; latitude: string; longitude: string; rent: { leases: number; share: string } }[];
      upcomingKeyDates: { dueOn: string; daysUntil: number; lease: { reference: string } }[];
      keyDateWeeks: { start: string; count: number }[];
      attentionBuckets: { withinDays: number; fromDays: number | null; count: number; rentAtStake: { amount: string } }[];
      attention: { hasOpenTask: boolean; rentAtStake: { amount: string }; keyDate: { kind: string; dueOn: string; status: string } }[];
      recentActivity: { createdAt: string; summary: string; lease: { reference: string } | null }[];
    } };
  };

  it('adds up: the profile, the country split and the register agree with the headline figures', async () => {
    const v = new Visitor(app);
    await v.signIn('mbuyu-court', 'VIEWER');
    const r = await v.gql<P>(PORTFOLIO);
    expect(r.errors).toBeUndefined();
    const p = r.data!.viewer.portfolio;
    expect(p.passingRent.currency).toBe(r.data!.viewer.tenant.reportingCurrency);
    expect(p.expiryProfile).toHaveLength(11);
    expect(p.expiryProfile.at(-1)!.year).toBeNull();
    expect(p.expiryProfile.reduce((n, b) => n + b.leases, 0)).toBe(p.liveLeases);
    expect(p.rentByCountry.reduce((n, c) => n + c.rent.leases, 0)).toBe(p.liveLeases);
    expect(p.rentByType.reduce((n, c) => n + c.rent.leases, 0)).toBe(p.liveLeases);
    // The map's cities sit in the company's countries, with a position, largest rent first.
    const countries = new Set(p.rentByCountry.map((c) => c.countryCode));
    expect(p.rentByCity.length).toBeGreaterThan(0);
    expect(p.rentByCity.every((c) => countries.has(c.countryCode) && Math.abs(Number(c.latitude)) <= 90 && Math.abs(Number(c.longitude)) <= 180)).toBe(true);
    const cityShares = p.rentByCity.map((c) => Number(c.rent.share));
    expect(cityShares).toEqual([...cityShares].sort((x, y) => y - x));
    const shares = p.rentByCountry.reduce((n, c) => n + Number(c.rent.share), 0);
    expect(Math.abs(shares - 1)).toBeLessThan(0.01);
    const register = await v.gql<{ viewer: { leases: { totalCount: number } } }>('{ viewer { leases(first: 1, filter: { status: [ACTIVE, HOLDING_OVER] }) { totalCount } } }');
    expect(register.data!.viewer.leases.totalCount).toBe(p.liveLeases);
    expect(Number(p.wault)).toBeGreaterThan(0);
    // Soonest first, and never a date further out than the window.
    const due = p.upcomingKeyDates.map((k) => k.dueOn);
    expect(due).toEqual([...due].sort());
    expect(p.upcomingKeyDates.every((k) => k.daysUntil <= 90)).toBe(true);
    // The 13 weekly columns cover the same 91 days as the 90-day count.
    expect(p.keyDateWeeks).toHaveLength(13);
    expect(p.keyDateWeeks.reduce((n, w) => n + w.count, 0)).toBe(p.keyDatesDue);
    // Needs attention: overdue, then exclusive bands 0–30, 31–60 and 61–90 days.
    expect(p.attentionBuckets.map((b) => [b.fromDays, b.withinDays])).toEqual([[null, 0], [0, 30], [31, 60], [61, 90]]);
    // The decisions overdue are a subset of all key dates overdue, which the headline counts.
    expect(p.attentionBuckets[0]!.count).toBeLessThanOrEqual(p.overdueKeyDates);
    expect(p.attention.every((a) => a.keyDate.status === 'UPCOMING' && ['BREAK_NOTICE', 'RENEWAL_NOTICE', 'RENT_REVIEW', 'EXPIRY'].includes(a.keyDate.kind))).toBe(true);
    // Overdue rows lead (largest rent first), then upcoming rows by deadline.
    const today = new Date().toISOString().slice(0, 10);
    const late = p.attention.filter((a) => a.keyDate.dueOn < today);
    const coming = p.attention.filter((a) => a.keyDate.dueOn >= today);
    expect(p.attention.slice(0, late.length)).toEqual(late);
    const lateRents = late.map((a) => Number(a.rentAtStake.amount));
    expect(lateRents).toEqual([...lateRents].sort((x, y) => y - x));
    const deadlines = coming.map((a) => a.keyDate.dueOn);
    expect(deadlines).toEqual([...deadlines].sort());
    // Nothing from the future shows as recent activity.
    expect(p.recentActivity.every((a) => Date.parse(a.createdAt) <= Date.now() + 60_000)).toBe(true);
  });

  it('counts only the signed-in company', async () => {
    const a = new Visitor(app, '198.51.100.20');
    const b = new Visitor(app, '198.51.100.21');
    await a.signIn('mbuyu-court', 'VIEWER');
    await b.signIn('sunbula', 'VIEWER');
    const [pa, pb] = await Promise.all([a.gql<P>(PORTFOLIO), b.gql<P>(PORTFOLIO)]);
    const ca = new Set(pa.data!.viewer.portfolio.rentByCountry.map((c) => c.countryCode));
    const cb = new Set(pb.data!.viewer.portfolio.rentByCountry.map((c) => c.countryCode));
    expect([...ca].some((c) => cb.has(c))).toBe(false);
  });

  it('follows the person’s own changes: a rent they raise counts in their figures only', async () => {
    const editor = new Visitor(app, '198.51.100.22');
    const other = new Visitor(app, '198.51.100.23');
    await editor.signIn('mbuyu-court', 'MANAGER');
    await other.signIn('mbuyu-court', 'VIEWER');
    const rent = async (v: Visitor) => Number((await v.gql<P>(PORTFOLIO)).data!.viewer.portfolio.passingRent.amount);
    const before = await rent(editor);
    const lease = await firstLease(editor);
    const r = await editor.gql<{ amendLease: { __typename: string } }>(AMEND, {
      input: { id: lease.id, version: lease.version, lease: toInput(lease.formData, (f) => { f.rent.rentPerPeriod = String(Number(f.rent.rentPerPeriod) * 3); f.rent.steps = []; }) },
    });
    expect(r.data!.amendLease.__typename).toBe('MutationAmendLeaseSuccess');
    expect(await rent(editor)).toBeGreaterThan(before);
    expect(await rent(other)).toBe(before);
  });
});
