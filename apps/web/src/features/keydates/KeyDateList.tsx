import { useEffect, useRef, useState, useTransition } from 'react';
import { graphql, useMutation, usePaginationFragment } from 'react-relay';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useTheme } from '@mui/material/styles';
import { BellRing, Check, MoreHorizontal, RotateCcw, X } from 'lucide-react';
import type { KeyDateList_viewer$key } from './__generated__/KeyDateList_viewer.graphql';
import type { KeyDateListUpdateMutation, KeyDateStatus } from './__generated__/KeyDateListUpdateMutation.graphql';
import { EmptyState } from '../../components/EmptyState.tsx';
import { Initials } from '../../components/Initials.tsx';
import { useFormat } from '../../i18n/format.ts';
import { FONT_MONO } from '../../theme/theme.ts';
import { useToast } from '../../shell/Toast.tsx';
import { filterKey, type GraphQLKeyDateFilter } from './urlState.ts';

const PAGE = 50;
export const REMINDER_CHOICES = [180, 90, 60, 30, 14, 7, 1];

// Open key dates as a ledger grouped by month: a calendar leaf, what it is, the lease, the owner and
// how far off it is. Managers mark a date done or dismissed in one move (with Undo) and set its
// reminders.
export function KeyDateList({ viewer: ref, filter, canEdit }: { viewer: KeyDateList_viewer$key; filter: GraphQLKeyDateFilter; canEdit: boolean }) {
  const { data, loadNext, hasNext, isLoadingNext, refetch } = usePaginationFragment(
    graphql`
      fragment KeyDateList_viewer on Viewer
      @refetchable(queryName: "KeyDateListPaginationQuery")
      @argumentDefinitions(first: { type: "Int", defaultValue: 50 }, after: { type: "String" }, filter: { type: "KeyDateFilter" }) {
        keyDates(first: $first, after: $after, filter: $filter) @connection(key: "KeyDateList_keyDates", filters: ["filter"]) {
          totalCount
          edges {
            node {
              id kind title dueOn daysUntil status version remindDays
              owner { id displayName initials }
              lease { id reference propertyName city }
            }
          }
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
  const [isPending, startTransition] = useTransition();
  const key = filterKey(filter);
  const last = useRef(key);
  useEffect(() => {
    if (key === last.current) return;
    last.current = key;
    startTransition(() => {
      refetch({ first: PAGE, filter }, { fetchPolicy: 'store-or-network' });
    });
  }, [key, filter, refetch]);

  const [commit] = useMutation<KeyDateListUpdateMutation>(graphql`
    mutation KeyDateListUpdateMutation($input: UpdateKeyDateInput!) {
      updateKeyDate(input: $input) {
        __typename
        ... on MutationUpdateKeyDateSuccess { data { keyDate { id status version remindDays } } }
        ... on ValidationFailed { message }
        ... on DomainError { message }
      }
    }
  `);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; id: string } | null>(null);
  const [reminders, setReminders] = useState<{ id: string; version: number; days: number[] } | null>(null);

  const update = (node: { id: string; version: number; status: KeyDateStatus; remindDays: readonly number[] }, patch: { status?: KeyDateStatus; remindDays?: number[] }, after?: (version: number) => void) => {
    commit({
      variables: { input: { id: node.id, version: node.version, ...patch } },
      optimisticResponse: {
        updateKeyDate: {
          __typename: 'MutationUpdateKeyDateSuccess',
          data: { keyDate: { id: node.id, status: patch.status ?? node.status, version: node.version + 1, remindDays: patch.remindDays ?? [...node.remindDays] } },
        },
      },
      onCompleted: (res) => {
        const r = res.updateKeyDate;
        if (r.__typename === 'MutationUpdateKeyDateSuccess' && r.data) after?.(r.data.keyDate.version);
        else toast.show(intl.formatMessage({ id: r.__typename === 'QuotaExceeded' ? 'common.quota' : 'common.error' }), 'error');
      },
      onError: () => toast.show(intl.formatMessage({ id: 'common.error' }), 'error'),
    });
  };

  const setStatus = (node: { id: string; version: number; status: KeyDateStatus; title: string; remindDays: readonly number[] }, status: KeyDateStatus) => {
    const previous = node.status;
    update(node, { status }, (version) => {
      toast.show(intl.formatMessage({ id: status === 'ACTIONED' ? 'keyDates.markedDone' : status === 'DISMISSED' ? 'keyDates.dismissed' : 'keyDates.reopened' }, { title: node.title }), 'success', {
        label: intl.formatMessage({ id: 'common.undo' }),
        onClick: () => update({ id: node.id, version, status, remindDays: node.remindDays }, { status: previous }),
      });
    });
  };

  const edges = data.keyDates.edges;
  if (edges.length === 0) {
    return <EmptyState title={intl.formatMessage({ id: 'keyDates.empty.title' })} body={intl.formatMessage({ id: 'keyDates.empty.body' })} />;
  }

  const monthFmt = new Intl.DateTimeFormat(intl.locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const day = new Intl.DateTimeFormat(intl.locale, { day: 'numeric', timeZone: 'UTC' });
  const mon = new Intl.DateTimeFormat(intl.locale, { month: 'short', timeZone: 'UTC' });
  let lastMonth = '';
  const menuNode = menu ? edges.find((e) => e.node.id === menu.id)?.node : undefined;

  return (
    <Box sx={{ opacity: isPending ? 0.55 : 1, transition: 'opacity 150ms ease' }}>
      <Box role="status" data-num sx={{ fontSize: '0.8125rem', color: t.inkSecondary, mb: 2 }}>
        <FormattedMessage id="keyDates.count" values={{ count: data.keyDates.totalCount }} />
      </Box>
      <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, border: `1px solid ${t.rule}`, borderRadius: 1.5, backgroundColor: t.surface, overflow: 'hidden' }}>
        {edges.map(({ node: k }) => {
          const month = k.dueOn.slice(0, 7);
          const header = month !== lastMonth;
          lastMonth = month;
          const date = new Date(`${k.dueOn}T00:00:00Z`);
          const open = k.status === 'UPCOMING';
          const late = open && k.daysUntil < 0;
          const soon = open && !late && k.daysUntil <= 30;
          return (
            <Box component="li" key={k.id}>
              {header && (
                <Box component="h2" sx={{ m: 0, px: { xs: 4, md: 5 }, py: 2, fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: t.inkSecondary, backgroundColor: t.sunken, borderBottom: `1px solid ${t.rule}` }}>
                  {monthFmt.format(date)}
                </Box>
              )}
              <Box
                sx={{
                  display: 'grid', alignItems: 'center', columnGap: 4, rowGap: 1, px: { xs: 4, md: 5 }, py: 2.5, borderBottom: `1px solid ${t.rule}`,
                  gridTemplateColumns: { xs: '44px minmax(0, 1fr) auto', md: '44px minmax(0, 1.2fr) minmax(0, 1fr) 160px 120px auto' },
                  borderInlineStart: `3px solid ${late ? t.danger : soon ? t.warning : 'transparent'}`,
                  opacity: open ? 1 : 0.6, transition: 'opacity 160ms ease, background-color 120ms ease', '&:hover': { backgroundColor: t.brandTint },
                }}
              >
                <Box aria-hidden sx={{ textAlign: 'center', borderRadius: 1, overflow: 'hidden', border: `1px solid ${late ? t.danger : t.ruleStrong}`, backgroundColor: t.paper }}>
                  <Box sx={{ fontSize: '0.5625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', backgroundColor: late ? t.danger : soon ? t.warning : t.ink, color: t.paper }}>{mon.format(date)}</Box>
                  <Box data-num sx={{ fontFamily: theme.typography.h1.fontFamily, fontSize: '1.05rem', lineHeight: 1.5 }}>{day.format(date)}</Box>
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Box sx={{ fontSize: '0.875rem', fontWeight: 600, textDecoration: open ? 'none' : 'line-through' }}><FormattedMessage id={`keyDate.${k.kind}`} /></Box>
                  <Box data-num sx={{ fontSize: '0.8125rem', color: late ? t.danger : soon ? t.warning : t.inkSecondary, fontWeight: late || soon ? 600 : 400 }}>
                    {!open ? <FormattedMessage id={k.status === 'ACTIONED' ? 'keyDates.status.ACTIONED' : 'keyDates.status.DISMISSED'} />
                      : late ? <FormattedMessage id="dashboard.attention.lateBy" values={{ days: -k.daysUntil }} />
                        : <>{f.date(k.dueOn, 'long')} · {f.relativeDays(k.daysUntil)}</>}
                  </Box>
                </Box>
                <Box sx={{ minWidth: 0, fontSize: '0.8125rem', gridColumn: { xs: '2', md: 'auto' } }}>
                  <Box component={RouterLink} to={`/leases/${encodeURIComponent(k.lease.id)}`} sx={{ fontFamily: FONT_MONO, color: t.brand, textDecoration: 'none', direction: 'ltr', unicodeBidi: 'isolate', '&:hover': { textDecoration: 'underline' } }}>
                    {k.lease.reference}
                  </Box>
                  <Box sx={{ color: t.inkSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.lease.propertyName} · {k.lease.city}</Box>
                </Box>
                <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 2, minWidth: 0, fontSize: '0.8125rem' }}>
                  {k.owner ? <><Initials text={k.owner.initials} size={26} /><Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.owner.displayName}</Box></> : <Box component="span" sx={{ color: t.inkTertiary }}><FormattedMessage id="keyDates.unowned" /></Box>}
                </Box>
                <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 1, fontSize: '0.75rem', color: t.inkSecondary }} data-num>
                  <BellRing size={13} aria-hidden />
                  {k.remindDays.length ? intl.formatList(k.remindDays.map((d) => intl.formatMessage({ id: 'keyDates.daysShort' }, { days: d })), { type: 'unit', style: 'narrow' }) : '—'}
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, gridColumn: { xs: '3', md: 'auto' }, gridRow: { xs: '1', md: 'auto' } }}>
                  {canEdit && open && (
                    <Button size="small" variant="outlined" startIcon={<Check size={14} aria-hidden />} onClick={() => setStatus(k, 'ACTIONED')} aria-describedby={`kd-${k.id}`}>
                      <FormattedMessage id="keyDates.done" />
                    </Button>
                  )}
                  {canEdit && (
                    <IconButton size="small" aria-label={intl.formatMessage({ id: 'keyDates.more' })} aria-describedby={`kd-${k.id}`} aria-haspopup="menu" onClick={(e) => setMenu({ anchor: e.currentTarget, id: k.id })}>
                      <MoreHorizontal size={16} />
                    </IconButton>
                  )}
                  <Box component="span" id={`kd-${k.id}`} sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
                    {intl.formatMessage({ id: `keyDate.${k.kind}` })}, {k.lease.reference}, {f.date(k.dueOn, 'long')}
                  </Box>
                </Box>
              </Box>
            </Box>
          );
        })}
      </Box>
      {hasNext && (
        <Box sx={{ display: 'grid', py: 4 }}>
          <Button variant="outlined" onClick={() => loadNext(PAGE)} loading={isLoadingNext} sx={{ minHeight: 44, justifySelf: 'center' }}><FormattedMessage id="keyDates.loadMore" /></Button>
        </Box>
      )}

      <Menu anchorEl={menu?.anchor} open={Boolean(menu && menuNode)} onClose={() => setMenu(null)}>
        {menuNode && menuNode.status === 'UPCOMING' && (
          <MenuItem onClick={() => { setStatus(menuNode, 'DISMISSED'); setMenu(null); }}>
            <X size={15} aria-hidden style={{ marginInlineEnd: 10 }} /><FormattedMessage id="keyDates.dismiss" />
          </MenuItem>
        )}
        {menuNode && menuNode.status !== 'UPCOMING' && (
          <MenuItem onClick={() => { setStatus(menuNode, 'UPCOMING'); setMenu(null); }}>
            <RotateCcw size={15} aria-hidden style={{ marginInlineEnd: 10 }} /><FormattedMessage id="keyDates.reopen" />
          </MenuItem>
        )}
        {menuNode && (
          <MenuItem onClick={() => { setReminders({ id: menuNode.id, version: menuNode.version, days: [...menuNode.remindDays] }); setMenu(null); }}>
            <BellRing size={15} aria-hidden style={{ marginInlineEnd: 10 }} /><FormattedMessage id="keyDates.reminders" />
          </MenuItem>
        )}
      </Menu>

      <Dialog open={reminders !== null} onClose={() => setReminders(null)} aria-labelledby="reminders-title" maxWidth="xs" fullWidth>
        <DialogTitle id="reminders-title" sx={{ fontFamily: theme.typography.h3.fontFamily }}><FormattedMessage id="keyDates.reminders" /></DialogTitle>
        <DialogContent>
          <Box sx={{ fontSize: '0.875rem', color: t.inkSecondary, mb: 3 }}><FormattedMessage id="keyDates.remindersHelp" /></Box>
          <Box role="group" aria-labelledby="reminders-title" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
            {REMINDER_CHOICES.map((d) => {
              const on = reminders?.days.includes(d) ?? false;
              return (
                <Chip
                  key={d}
                  label={intl.formatMessage({ id: 'keyDates.daysBefore' }, { days: d })}
                  color={on ? 'primary' : 'default'}
                  variant={on ? 'filled' : 'outlined'}
                  aria-pressed={on}
                  onClick={() => setReminders((r) => (r ? { ...r, days: on ? r.days.filter((x) => x !== d) : [...r.days, d] } : r))}
                  icon={on ? <Check size={14} /> : undefined}
                />
              );
            })}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 6, pb: 5 }}>
          <Button onClick={() => setReminders(null)}><FormattedMessage id="common.cancel" /></Button>
          <Button
            variant="contained"
            disabled={!reminders || reminders.days.length === 0}
            onClick={() => {
              if (!reminders) return;
              const node = edges.find((e) => e.node.id === reminders.id)?.node;
              if (node) update(node, { remindDays: reminders.days }, () => toast.show(intl.formatMessage({ id: 'keyDates.remindersSaved' })));
              setReminders(null);
            }}
          >
            <FormattedMessage id="common.save" />
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
