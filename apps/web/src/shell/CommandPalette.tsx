import { Suspense, useDeferredValue, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { FormattedMessage, useIntl } from 'react-intl';
import { useNavigate } from 'react-router';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import Skeleton from '@mui/material/Skeleton';
import { useTheme } from '@mui/material/styles';
import { ArrowRight, CalendarClock, CornerDownLeft, FilePlus2, LayoutDashboard, ScrollText, Search } from 'lucide-react';
import type { CommandPaletteSearchQuery } from './__generated__/CommandPaletteSearchQuery.graphql';
import { StatusChip, type LeaseStatus } from '../components/StatusChip.tsx';
import { FONT_MONO } from '../theme/theme.ts';

interface Item {
  id: string;
  group: 'go' | 'leases';
  label: ReactNode;
  hint?: ReactNode;
  icon: ReactNode;
  run(): void;
}

// The palette itself (loaded on first open). A combobox over one listbox: pages to go to, then
// leases matching what was typed. Arrow keys move, Enter opens, Escape closes.
export default function CommandPalette({ open, onClose, canEdit }: { open: boolean; onClose(): void; canEdit: boolean }) {
  const intl = useIntl();
  const theme = useTheme();
  const t = theme.tokens;
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query.trim());
  const [active, setActive] = useState(0);
  const listId = useId();
  const [leaseItems, setLeaseItems] = useState<Item[]>([]);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setQuery(''); setActive(0); }
  }, [open]);

  const go = (to: string) => () => { onClose(); navigate(to); };
  const pages: Item[] = useMemo(() => [
    { id: 'go-overview', group: 'go' as const, label: intl.formatMessage({ id: 'nav.overview' }), icon: <LayoutDashboard size={16} aria-hidden />, run: go('/') },
    { id: 'go-leases', group: 'go' as const, label: intl.formatMessage({ id: 'nav.leases' }), icon: <ScrollText size={16} aria-hidden />, run: go('/leases') },
    { id: 'go-keydates', group: 'go' as const, label: intl.formatMessage({ id: 'nav.keyDates' }), icon: <CalendarClock size={16} aria-hidden />, run: go('/key-dates') },
    ...(canEdit ? [{ id: 'go-new', group: 'go' as const, label: intl.formatMessage({ id: 'nav.newLease' }), icon: <FilePlus2 size={16} aria-hidden />, run: go('/leases/new') }] : []),
  ], [canEdit, intl]);
  const matchingPages = deferred ? pages.filter((p) => String(p.label).toLocaleLowerCase(intl.locale).includes(deferred.toLocaleLowerCase(intl.locale))) : pages;
  const searchAll: Item | null = deferred
    ? { id: 'go-search', group: 'go', label: intl.formatMessage({ id: 'palette.searchRegister' }, { query: deferred }), icon: <Search size={16} aria-hidden />, run: go(`/leases?q=${encodeURIComponent(deferred)}`) }
    : null;
  const items = [...matchingPages, ...(searchAll ? [searchAll] : []), ...leaseItems];
  const current = Math.min(active, Math.max(items.length - 1, 0));

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((current + 1) % Math.max(items.length, 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((current - 1 + items.length) % Math.max(items.length, 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); items[current]?.run(); }
  };

  useEffect(() => {
    document.getElementById(`${listId}-${current}`)?.scrollIntoView({ block: 'nearest' });
  }, [current, listId]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      slotProps={{ paper: { 'aria-label': intl.formatMessage({ id: 'palette.title' }), sx: { alignSelf: 'flex-start', mt: { xs: 2, md: '12vh' }, overflow: 'hidden' } } }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, px: 4, borderBottom: `1px solid ${t.rule}` }}>
        <Search size={18} aria-hidden style={{ color: t.inkTertiary, flexShrink: 0 }} />
        <Box
          component="input"
          ref={input}
          autoFocus
          value={query}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setQuery(e.target.value); setActive(0); }}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={items.length ? `${listId}-${current}` : undefined}
          aria-label={intl.formatMessage({ id: 'palette.title' })}
          placeholder={intl.formatMessage({ id: 'palette.placeholder' })}
          sx={{ flex: 1, minWidth: 0, height: 56, border: 0, outline: 0, background: 'transparent', color: t.ink, font: 'inherit', fontSize: 16 }}
        />
        <Box component="kbd" sx={{ fontFamily: FONT_MONO, fontSize: '0.6875rem', color: t.inkTertiary, border: `1px solid ${t.rule}`, borderRadius: 0.75, px: 1, py: 0.25 }}>Esc</Box>
      </Box>
      <Box component="ul" id={listId} role="listbox" aria-label={intl.formatMessage({ id: 'palette.results' })} sx={{ listStyle: 'none', m: 0, p: 1.5, maxHeight: '55vh', overflowY: 'auto' }}>
        {items.map((item, i) => {
          const first = i === 0 || items[i - 1]!.group !== item.group;
          return (
            <Box component="li" key={item.id} role="presentation">
              {first && (
                <Box aria-hidden sx={{ px: 3, pt: i === 0 ? 1 : 3, pb: 1, fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: t.inkTertiary }}>
                  <FormattedMessage id={item.group === 'go' ? 'palette.goTo' : 'palette.leases'} />
                </Box>
              )}
              <Box
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === current}
                onMouseMove={() => setActive(i)}
                onClick={() => item.run()}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 3, px: 3, minHeight: 44, borderRadius: 1, cursor: 'pointer',
                  backgroundColor: i === current ? t.brandSoft : 'transparent', color: t.ink,
                }}
              >
                <Box sx={{ display: 'inline-flex', color: i === current ? t.brand : t.inkSecondary }}>{item.icon}</Box>
                <Box sx={{ flex: 1, minWidth: 0, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</Box>
                {item.hint}
                {i === current && <CornerDownLeft size={14} aria-hidden style={{ color: t.inkTertiary, flexShrink: 0 }} />}
              </Box>
            </Box>
          );
        })}
        {deferred.length >= 2 && (
          <Suspense fallback={<Box sx={{ px: 3, py: 1 }}><Skeleton height={36} /><Skeleton height={36} /></Box>}>
            <LeaseResults search={deferred} onItems={setLeaseItems} onOpen={(id) => go(`/leases/${encodeURIComponent(id)}`)()} />
          </Suspense>
        )}
        {deferred.length < 2 && <LeaseResultsReset onItems={setLeaseItems} />}
      </Box>
      <Box sx={{ display: 'flex', gap: 4, px: 4, py: 2, borderTop: `1px solid ${t.rule}`, backgroundColor: t.sunken, fontSize: '0.75rem', color: t.inkSecondary }}>
        <span><Kbd>↑</Kbd><Kbd>↓</Kbd> <FormattedMessage id="palette.move" /></span>
        <span><Kbd>↵</Kbd> <FormattedMessage id="palette.select" /></span>
      </Box>
    </Dialog>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  const t = useTheme().tokens;
  return <Box component="kbd" sx={{ fontFamily: FONT_MONO, fontSize: '0.6875rem', border: `1px solid ${t.ruleStrong}`, borderRadius: 0.75, px: 0.75, mx: 0.25, backgroundColor: t.surface }}>{children}</Box>;
}

function LeaseResultsReset({ onItems }: { onItems(items: Item[]): void }) {
  useEffect(() => onItems([]), [onItems]);
  return null;
}

function LeaseResults({ search, onItems, onOpen }: { search: string; onItems(items: Item[]): void; onOpen(id: string): void }) {
  const t = useTheme().tokens;
  // Held in a ref: the parent passes a new function each render, and the items must not rebuild then.
  const openRef = useRef(onOpen);
  openRef.current = onOpen;
  const data = useLazyLoadQuery<CommandPaletteSearchQuery>(
    graphql`
      query CommandPaletteSearchQuery($search: String!) {
        viewer {
          leases(first: 6, filter: { search: $search }) {
            edges { node { id reference propertyName city status } }
          }
        }
      }
    `,
    { search },
    { fetchPolicy: 'store-or-network' },
  );
  const edges = data.viewer?.leases.edges;
  useEffect(() => {
    onItems((edges ?? []).map(({ node }) => ({
      id: `lease-${node.id}`,
      group: 'leases' as const,
      icon: <ArrowRight size={16} aria-hidden />,
      label: (
        <>
          <Box component="span" sx={{ fontFamily: FONT_MONO, fontSize: '0.8125rem', marginInlineEnd: 2, direction: 'ltr', unicodeBidi: 'isolate' }}>{node.reference}</Box>
          {node.propertyName}
          <Box component="span" sx={{ color: t.inkSecondary }}>{node.city ? ` · ${node.city}` : ''}</Box>
        </>
      ),
      hint: <StatusChip status={node.status as LeaseStatus} size="small" />,
      run: () => openRef.current(node.id),
    })));
  }, [edges, onItems, t.inkSecondary]);
  if (edges && edges.length === 0) {
    return <Box role="status" sx={{ px: 3, py: 3, fontSize: '0.8125rem', color: t.inkSecondary }}><FormattedMessage id="palette.noLeases" /></Box>;
  }
  return null;
}
