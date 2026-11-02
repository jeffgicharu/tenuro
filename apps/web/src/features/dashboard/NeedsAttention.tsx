import { useState } from 'react';
import { graphql, useFragment, useMutation } from 'react-relay';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { useTheme } from '@mui/material/styles';
import { AlarmClock, ArrowRight, CalendarClock, Check, DoorOpen, ListPlus, RefreshCcw, Scale } from 'lucide-react';
import type { NeedsAttention_portfolio$key } from './__generated__/NeedsAttention_portfolio.graphql';
import type { NeedsAttentionCreateTaskMutation } from './__generated__/NeedsAttentionCreateTaskMutation.graphql';
import type { NeedsAttentionCancelTaskMutation } from './__generated__/NeedsAttentionCancelTaskMutation.graphql';
import { useFormat } from '../../i18n/format.ts';
import { FONT_MONO } from '../../theme/theme.ts';
import { useToast } from '../../shell/Toast.tsx';

const KIND_ICON = { BREAK_NOTICE: DoorOpen, RENEWAL_NOTICE: RefreshCcw, RENT_REVIEW: Scale, EXPIRY: CalendarClock } as const;

// What an occupier's property director opens the product for: decisions with a deadline, the rent
// each puts at stake, and a way to act on each one now (hand it to someone as a task, or open it).
export function NeedsAttention({ portfolio: ref, canEdit, userId }: { portfolio: NeedsAttention_portfolio$key; canEdit: boolean; userId: string }) {
  const p = useFragment(
    graphql`
      fragment NeedsAttention_portfolio on Portfolio {
        attentionBuckets { withinDays count rentAtStake { amount currency } }
        attention(first: 6) {
          hasOpenTask
          rentAtStake { amount currency }
          keyDate { id kind dueOn daysUntil lease { id reference propertyName city } }
        }
      }
    `,
    ref,
  );
  const theme = useTheme();
  const t = theme.tokens;
  const f = useFormat();
  const intl = useIntl();
  const toast = useToast();
  const rtl = theme.direction === 'rtl';
  // Tasks created from here, by key date, so a row shows its task at once (and Undo can cancel it).
  const [created, setCreated] = useState<Record<string, { id: string; version: number } | 'pending'>>({});
  const [createTask] = useMutation<NeedsAttentionCreateTaskMutation>(graphql`
    mutation NeedsAttentionCreateTaskMutation($input: CreateTaskInput!) {
      createTask(input: $input) {
        __typename
        ... on MutationCreateTaskSuccess { data { task { id version } } }
        ... on DomainError { message }
      }
    }
  `);
  const [cancelTask] = useMutation<NeedsAttentionCancelTaskMutation>(graphql`
    mutation NeedsAttentionCancelTaskMutation($input: UpdateTaskInput!) {
      updateTask(input: $input) {
        __typename
        ... on MutationUpdateTaskSuccess { data { task { id status version } } }
        ... on DomainError { message }
      }
    }
  `);

  const compact = (m: { amount: string; currency: string }) => f.money(m.amount, m.currency, { compact: true });
  const forget = (keyDateId: string) => setCreated(({ [keyDateId]: _gone, ...rest }) => rest);

  const assign = (item: (typeof p.attention)[number]) => {
    const k = item.keyDate;
    const kindLabel = intl.formatMessage({ id: `keyDate.${k.kind}` });
    const dueOn = k.daysUntil > 14 ? addDaysIso(k.dueOn, -14) : null;
    setCreated((c) => ({ ...c, [k.id]: 'pending' }));
    createTask({
      variables: {
        input: {
          keyDateId: k.id, leaseId: k.lease.id, assigneeId: userId, priority: k.daysUntil <= 30 ? 'HIGH' : 'NORMAL',
          title: intl.formatMessage({ id: 'dashboard.attention.taskTitle' }, { kind: kindLabel, reference: k.lease.reference }),
          ...(dueOn ? { dueOn } : {}),
        },
      },
      onCompleted: (res) => {
        const r = res.createTask;
        if (r.__typename !== 'MutationCreateTaskSuccess' || !r.data) {
          forget(k.id);
          toast.show(intl.formatMessage({ id: r.__typename === 'QuotaExceeded' ? 'common.quota' : 'common.error' }), 'error');
          return;
        }
        const task = r.data.task;
        setCreated((c) => ({ ...c, [k.id]: { id: task.id, version: task.version } }));
        toast.show(intl.formatMessage({ id: 'dashboard.attention.taskCreated' }, { reference: k.lease.reference }), 'success', {
          label: intl.formatMessage({ id: 'common.undo' }),
          onClick: () => {
            forget(k.id);
            cancelTask({
              variables: { input: { id: task.id, version: task.version, status: 'CANCELLED' } },
              onError: () => toast.show(intl.formatMessage({ id: 'common.error' }), 'error'),
            });
          },
        });
      },
      onError: () => { forget(k.id); toast.show(intl.formatMessage({ id: 'common.error' }), 'error'); },
    });
  };

  const [overdue, ...windows] = p.attentionBuckets;

  return (
    <Box component="section" aria-labelledby="attention-title" sx={{ backgroundColor: t.surface, border: `1px solid ${t.rule}`, borderRadius: 1.5, overflow: 'hidden' }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 3, px: { xs: 4, md: 6 }, pt: { xs: 4, md: 5 }, pb: 3 }}>
        <Box sx={{ flex: 1, minWidth: 220 }}>
          <Box component="h2" id="attention-title" sx={{ ...theme.typography.h3, m: 0, display: 'flex', alignItems: 'center', gap: 2 }}>
            <AlarmClock size={20} strokeWidth={1.7} aria-hidden style={{ color: t.warning }} />
            <FormattedMessage id="dashboard.attention.title" />
          </Box>
          <Box sx={{ mt: 0.5, fontSize: '0.8125rem', color: t.inkSecondary }}><FormattedMessage id="dashboard.attention.lede" /></Box>
        </Box>
        <Button component={RouterLink} to="/leases?keyIn=90&keyKind=BREAK_NOTICE&keyKind=RENEWAL_NOTICE&keyKind=RENT_REVIEW&keyKind=EXPIRY" size="small"
          endIcon={<ArrowRight size={14} aria-hidden style={rtl ? { transform: 'scaleX(-1)' } : undefined} />}>
          <FormattedMessage id="dashboard.attention.viewAll" />
        </Button>
      </Box>

      {/* Windows: overdue, then 30, 60 and 90 days (cumulative), each with the rent at stake. */}
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, borderTop: `1px solid ${t.rule}`, borderBottom: `1px solid ${t.rule}` }}>
        {[overdue, ...windows].filter(Boolean).map((b) => {
          const isOverdue = b!.withinDays === 0;
          const hot = isOverdue && b!.count > 0;
          return (
            <Box component="li" key={b!.withinDays} sx={{ px: { xs: 4, md: 6 }, py: 3.5, borderInlineEnd: `1px solid ${t.rule}`, backgroundColor: hot ? t.dangerSoft : 'transparent', '&:last-of-type': { borderInlineEnd: 0 } }}>
              <Box sx={{ fontSize: '0.75rem', color: hot ? t.danger : t.inkSecondary, fontWeight: hot ? 600 : 400 }}>
                {isOverdue ? <FormattedMessage id="dashboard.attention.overdue" /> : <FormattedMessage id="dashboard.attention.within" values={{ days: b!.withinDays }} />}
              </Box>
              <Box data-num sx={{ display: 'flex', alignItems: 'baseline', gap: 2, mt: 0.5 }}>
                <Box component="span" sx={{ fontFamily: theme.typography.h1.fontFamily, fontSize: '1.6rem', fontWeight: theme.direction === 'rtl' ? 600 : 500, color: hot ? t.danger : t.ink }}>{f.number(b!.count)}</Box>
                <Box component="span" sx={{ fontSize: '0.8125rem', color: t.inkSecondary, whiteSpace: 'nowrap' }}>
                  <FormattedMessage id="dashboard.kpi.rentAtStake" values={{ rent: <bdi>{compact(b!.rentAtStake)}</bdi> }} />
                </Box>
              </Box>
            </Box>
          );
        })}
      </Box>

      {p.attention.length === 0 ? (
        <Box sx={{ px: { xs: 4, md: 6 }, py: 6, color: t.inkSecondary, fontSize: '0.875rem' }}><FormattedMessage id="dashboard.attention.empty" /></Box>
      ) : (
        <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {p.attention.map((item) => {
            const k = item.keyDate;
            const Icon = KIND_ICON[k.kind as keyof typeof KIND_ICON] ?? CalendarClock;
            const late = k.daysUntil < 0;
            const soon = !late && k.daysUntil <= 30;
            const state = created[k.id];
            const hasTask = item.hasOpenTask || state !== undefined;
            return (
              <Box
                component="li"
                key={k.id}
                sx={{
                  display: 'grid', alignItems: 'center', columnGap: 4, rowGap: 1.5, px: { xs: 4, md: 6 }, py: 3, borderBottom: `1px solid ${t.rule}`,
                  gridTemplateColumns: { xs: '36px minmax(0, 1fr)', md: '36px minmax(0, 1.4fr) minmax(0, 1fr) 128px auto' },
                  '&:last-of-type': { borderBottom: 0 }, transition: 'background-color 120ms ease', '&:hover': { backgroundColor: t.brandTint },
                  borderInlineStart: `3px solid ${late ? t.danger : soon ? t.warning : 'transparent'}`,
                }}
              >
                <Box aria-hidden sx={{ width: 36, height: 36, borderRadius: 1, display: 'grid', placeItems: 'center', backgroundColor: late ? t.dangerSoft : t.sunken, color: late ? t.danger : t.inkSecondary }}>
                  <Icon size={18} strokeWidth={1.7} />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Box sx={{ fontSize: '0.875rem', fontWeight: 600 }}><FormattedMessage id={`keyDate.${k.kind}`} /></Box>
                  <Box sx={{ fontSize: '0.8125rem', color: late ? t.danger : soon ? t.warning : t.inkSecondary, fontWeight: late || soon ? 600 : 400 }} data-num>
                    {late
                      ? <FormattedMessage id="dashboard.attention.lateBy" values={{ days: -k.daysUntil }} />
                      : <>{f.date(k.dueOn)} · {f.relativeDays(k.daysUntil)}</>}
                  </Box>
                </Box>
                <Box sx={{ minWidth: 0, gridColumn: { xs: '2', md: 'auto' }, fontSize: '0.8125rem' }}>
                  <Box component={RouterLink} to={`/leases/${encodeURIComponent(k.lease.id)}`} sx={{ fontFamily: FONT_MONO, color: t.brand, textDecoration: 'none', direction: 'ltr', unicodeBidi: 'isolate', '&:hover': { textDecoration: 'underline' } }}>
                    {k.lease.reference}
                  </Box>
                  <Box sx={{ color: t.inkSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {k.lease.propertyName}{k.lease.city ? ` · ${k.lease.city}` : ''}
                  </Box>
                </Box>
                <Box data-num sx={{ gridColumn: { xs: '2', md: 'auto' }, textAlign: { md: 'end' }, fontSize: '0.875rem' }}>
                  <Box component="span" sx={{ display: { md: 'block' }, fontSize: '0.6875rem', color: t.inkTertiary, marginInlineEnd: { xs: 1.5, md: 0 } }}>
                    <FormattedMessage id="dashboard.attention.atStake" />
                  </Box>
                  <bdi title={f.money(item.rentAtStake.amount, item.rentAtStake.currency)} style={{ fontWeight: 600 }}>{compact(item.rentAtStake)}</bdi>
                </Box>
                <Box sx={{ gridColumn: { xs: '2', md: 'auto' }, display: 'flex', gap: 1.5, justifyContent: { md: 'flex-end' } }}>
                  {hasTask ? (
                    <Box component="span" role="status" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, fontSize: '0.8125rem', color: t.success, px: 1.5, minHeight: 32 }}>
                      <Check size={15} strokeWidth={2.2} aria-hidden />
                      <FormattedMessage id={state === 'pending' ? 'dashboard.attention.assigning' : 'dashboard.attention.taskOpen'} />
                    </Box>
                  ) : canEdit ? (
                    <Button size="small" variant="outlined" startIcon={<ListPlus size={15} aria-hidden />} onClick={() => assign(item)} aria-describedby={`att-${k.id}`}>
                      <FormattedMessage id="dashboard.attention.assign" />
                    </Button>
                  ) : null}
                  <Button size="small" component={RouterLink} to={`/leases/${encodeURIComponent(k.lease.id)}`} aria-describedby={`att-${k.id}`}>
                    <FormattedMessage id="dashboard.attention.open" />
                  </Button>
                  <Box component="span" id={`att-${k.id}`} sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
                    {intl.formatMessage({ id: `keyDate.${k.kind}` })}, {k.lease.reference}
                  </Box>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
