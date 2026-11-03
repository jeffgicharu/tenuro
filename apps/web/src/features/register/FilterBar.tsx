import { lazy, startTransition, Suspense, useEffect, useId, useMemo, useRef, useState } from 'react';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { FormattedMessage, useIntl } from 'react-intl';
import dayjs, { type Dayjs } from 'dayjs';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Checkbox from '@mui/material/Checkbox';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import FormControlLabel from '@mui/material/FormControlLabel';
import Popover from '@mui/material/Popover';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import type { FilterBarFacetsQuery } from './__generated__/FilterBarFacetsQuery.graphql';
import { SearchField } from '../../components/SearchField.tsx';
import { useFormat } from '../../i18n/format.ts';
import {
  activeFilterCount, toGraphQLFilter, type KeyDateKind, type LeaseStatus, type PropertyType, type RegisterFilter,
} from './urlState.ts';

const ExpiryRange = lazy(() => import('./ExpiryRange.tsx'));

type FacetKey ='status' | 'countryCode' | 'city' | 'propertyType' | 'currency';

interface Option {
  value: string;
  label: string;
  count?: number;
}

interface Props {
  filter: RegisterFilter;
  onChange(filter: RegisterFilter): void;
  reportingCurrency: string;
}

const STATUSES: LeaseStatus[] = ['ACTIVE', 'HOLDING_OVER', 'EXPIRED', 'TERMINATED'];
const TYPES: PropertyType[] = ['OFFICE', 'RETAIL', 'WAREHOUSE', 'INDUSTRIAL', 'MIXED_USE'];
const KINDS: KeyDateKind[] = ['BREAK_NOTICE', 'RENEWAL_NOTICE', 'RENT_REVIEW', 'RENT_INCREASE', 'EXPIRY', 'DEPOSIT_RETURN', 'INSURANCE'];

const without = <K extends keyof RegisterFilter>(f: RegisterFilter, ...keys: K[]): RegisterFilter => {
  const next = { ...f };
  for (const k of keys) delete next[k];
  return next;
};

interface Section {
  key: string;
  label: string;
  summary: string | null;
  clear(): void;
  // The editor; receives a close function for "Apply"-style forms. Absent for a plain toggle.
  editor?: (close: () => void) => React.ReactNode;
  toggle?: () => void;
}

// Search stays inline; every other filter lives behind one "Filters" control (a popover on wide
// screens, a bottom sheet on phones), and each active filter shows as a removable chip.
export function FilterBar({ filter, onChange, reportingCurrency }: Props) {
  const intl = useIntl();
  const f = useFormat();
  const theme = useTheme();
  const t = theme.tokens;
  const narrow = useMediaQuery(theme.breakpoints.down('md'), { noSsr: true });
  const country = useMemo(() => new Intl.DisplayNames([intl.locale], { type: 'region' }), [intl.locale]);
  const m = (id: string, values?: Record<string, string | number>) => intl.formatMessage({ id }, values);
  const set = (patch: RegisterFilter) => onChange({ ...filter, ...patch });
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const filtersButton = useRef<HTMLButtonElement>(null);

  const listSummary = (values: readonly string[] | undefined, label: (v: string) => string) => {
    if (!values?.length) return null;
    return values.length === 1 ? label(values[0]!) : m('register.filter.selected', { count: values.length });
  };

  const labels: Record<FacetKey, (v: string) => string> = {
    status: (v) => m(`status.${v}`),
    countryCode: (v) => country.of(v) ?? v,
    city: (v) => v,
    propertyType: (v) => m(`propertyType.${v}`),
    currency: (v) => v,
  };

  const listSection = (key: FacetKey, labelId: string, fixed?: readonly string[], searchable = false): Section => {
    const values = filter[key] as readonly string[] | undefined;
    return {
      key,
      label: m(labelId),
      summary: listSummary(values, labels[key]),
      clear: () => onChange(without(filter, key)),
      editor: () => (
        <Suspense fallback={<FacetSkeleton />}>
          <FacetList
            facet={key}
            filter={filter}
            fixed={fixed}
            label={labels[key]}
            selected={values ?? []}
            searchable={searchable}
            onChange={(next) => onChange(next.length ? { ...filter, [key]: next } : without(filter, key))}
          />
        </Suspense>
      ),
    };
  };

  const expirySummary = filter.expiresWithinDays
    ? m('register.filter.withinShort', { days: filter.expiresWithinDays })
    : filter.expiry
      ? rangeSummary(filter.expiry.from ? f.date(filter.expiry.from, 'short') : undefined, filter.expiry.to ? f.date(filter.expiry.to, 'short') : undefined, m)
      : null;
  const rentSummary = filter.annualRent
    ? rangeSummary(
        filter.annualRent.min ? f.money(filter.annualRent.min, reportingCurrency, { compact: true }) : undefined,
        filter.annualRent.max ? f.money(filter.annualRent.max, reportingCurrency, { compact: true }) : undefined, m)
    : null;
  const keySummary = filter.nextKeyWithinDays || filter.nextKeyKind?.length
    ? [filter.nextKeyWithinDays ? m('register.filter.withinShort', { days: filter.nextKeyWithinDays }) : null,
       filter.nextKeyKind?.length === 1 ? m(`keyDate.${filter.nextKeyKind[0]}`) : filter.nextKeyKind?.length ? m('register.filter.selected', { count: filter.nextKeyKind.length }) : null]
      .filter(Boolean).join(' · ')
    : null;

  const sections: Section[] = [
    listSection('status', 'register.filter.status', STATUSES),
    {
      key: 'expiry', label: m('register.filter.expiry'), summary: expirySummary,
      clear: () => onChange(without(filter, 'expiresWithinDays', 'expiry')),
      editor: (close) => <ExpiryForm filter={filter} onApply={(next) => { onChange(next); close(); }} />,
    },
    {
      key: 'nextKey', label: m('register.filter.nextKey'), summary: keySummary,
      clear: () => onChange(without(filter, 'nextKeyWithinDays', 'nextKeyKind')),
      editor: (close) => <NextKeyForm filter={filter} onApply={(next) => { onChange(next); close(); }} />,
    },
    {
      key: 'openBreak', label: m('register.filter.openBreak'), summary: filter.hasOpenBreak ? '' : null,
      clear: () => onChange(without(filter, 'hasOpenBreak')),
      toggle: () => (filter.hasOpenBreak ? onChange(without(filter, 'hasOpenBreak')) : set({ hasOpenBreak: true })),
    },
    listSection('countryCode', 'register.filter.country'),
    listSection('city', 'register.filter.city', undefined, true),
    listSection('propertyType', 'register.filter.type', TYPES),
    listSection('currency', 'register.filter.currency'),
    {
      key: 'rent', label: m('register.filter.rent'), summary: rentSummary,
      clear: () => onChange(without(filter, 'annualRent')),
      editor: (close) => <RentForm filter={filter} currency={reportingCurrency} onApply={(next) => { onChange(next); close(); }} />,
    },
  ];
  const active = sections.filter((s) => s.summary !== null);
  const count = activeFilterCount(filter);

  const open = (section: string | null) => {
    setExpanded(section);
    setAnchor(filtersButton.current);
  };
  const close = () => setAnchor(null);

  const panel = (
    <FilterPanel
      sections={sections}
      expanded={expanded}
      onExpand={setExpanded}
      onClose={close}
      {...(count > 0 ? { onClearAll: () => onChange({}) } : {})}
      narrow={narrow}
    />
  );

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
      <SearchField
        value={filter.search ?? ''}
        onChange={(v) => (v.trim() ? set({ search: v.trim() }) : onChange(without(filter, 'search')))}
        label={m('register.search')}
        placeholder={m('register.searchPlaceholder')}
        clearLabel={m('common.clear')}
        width={320}
      />
      <Button
        ref={filtersButton}
        variant="outlined"
        onClick={() => open(null)}
        aria-haspopup="dialog"
        aria-expanded={Boolean(anchor)}
        startIcon={<SlidersHorizontal size={16} strokeWidth={1.8} aria-hidden />}
        sx={{ height: 40, borderColor: count ? t.brand : t.ruleStrong, color: t.ink, backgroundColor: count ? t.brandSoft : t.surface }}
      >
        <FormattedMessage id="register.filters" />
        {count > 0 && (
          <Box component="span" data-num sx={{ marginInlineStart: 1.5, minWidth: 20, height: 20, px: 1, borderRadius: 10, display: 'inline-grid', placeItems: 'center', fontSize: '0.75rem', fontWeight: 600, backgroundColor: t.brand, color: t.brandContrast }}>
            {count}
          </Box>
        )}
      </Button>
      {active.map((s) => (
        <ActiveFilter
          key={s.key}
          label={s.summary ? `${s.label}: ${s.summary}` : s.label}
          removeLabel={m('register.clearFilter', { name: s.label })}
          onOpen={() => (s.toggle ? undefined : open(s.key))}
          onRemove={s.clear}
        />
      ))}
      {count > 1 && (
        <Button size="small" variant="text" onClick={() => onChange({})} sx={{ color: 'text.secondary' }}>
          <FormattedMessage id="register.clearAll" />
        </Button>
      )}
      {narrow ? (
        <Drawer
          anchor="bottom"
          open={Boolean(anchor)}
          onClose={close}
          slotProps={{ paper: { 'aria-label': m('register.filters'), sx: { maxHeight: '85dvh', borderTopLeftRadius: 12, borderTopRightRadius: 12, backgroundColor: t.surface } } }}
        >
          {panel}
        </Drawer>
      ) : (
        <Popover
          open={Boolean(anchor)}
          anchorEl={anchor}
          onClose={close}
          anchorOrigin={{ vertical: 'bottom', horizontal: theme.direction === 'rtl' ? 'right' : 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: theme.direction === 'rtl' ? 'right' : 'left' }}
          slotProps={{ paper: { 'aria-label': m('register.filters'), role: 'dialog', sx: { width: 380, maxHeight: 'min(640px, 75dvh)', mt: 1, display: 'flex', flexDirection: 'column' } } }}
        >
          {panel}
        </Popover>
      )}
    </Box>
  );
}

function ActiveFilter({ label, removeLabel, onOpen, onRemove }: { label: string; removeLabel: string; onOpen(): void; onRemove(): void }) {
  const t = useTheme().tokens;
  return (
    <Box
      sx={{
        display: 'inline-flex', alignItems: 'stretch', height: 32, borderRadius: 16, overflow: 'hidden', maxWidth: '100%',
        border: `1px solid ${t.brand}`, backgroundColor: t.brandSoft, color: t.ink, fontSize: '0.8125rem',
        '@media (prefers-reduced-motion: no-preference)': { animation: 'chip-in 160ms ease-out', '@keyframes chip-in': { from: { opacity: 0, transform: 'scale(0.96)' } } },
      }}
    >
      <ButtonBase onClick={onOpen} sx={{ px: 3, fontWeight: 500, minWidth: 0, '&.Mui-focusVisible': { outline: `2px solid ${t.focus}`, outlineOffset: -2 } }}>
        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</Box>
      </ButtonBase>
      <ButtonBase
        onClick={onRemove}
        aria-label={removeLabel}
        sx={{ px: 2, borderInlineStart: `1px solid ${t.brand}`, '&:hover': { backgroundColor: t.brandTint }, '&.Mui-focusVisible': { outline: `2px solid ${t.focus}`, outlineOffset: -2 } }}
      >
        <X size={14} strokeWidth={2} aria-hidden />
      </ButtonBase>
    </Box>
  );
}

function FilterPanel({ sections, expanded, onExpand, onClose, onClearAll, narrow }: {
  sections: Section[];
  expanded: string | null;
  onExpand(key: string | null): void;
  onClose(): void;
  onClearAll?: () => void;
  narrow: boolean;
}) {
  const t = useTheme().tokens;
  const idBase = useId();
  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 4, py: 3, borderBottom: `1px solid ${t.rule}` }}>
        {narrow && <Box aria-hidden sx={{ position: 'absolute', top: 6, insetInline: 0, mx: 'auto', width: 36, height: 4, borderRadius: 2, backgroundColor: t.ruleStrong }} />}
        <Box component="h2" sx={{ m: 0, flex: 1, fontSize: '1rem', fontWeight: 600 }}><FormattedMessage id="register.filters" /></Box>
        {onClearAll && <Button size="small" onClick={onClearAll}><FormattedMessage id="register.clearAll" /></Button>}
      </Box>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, overflowY: 'auto', flex: 1 }}>
        {sections.map((s) => {
          const isOpen = expanded === s.key;
          const regionId = `${idBase}-${s.key}`;
          return (
            <Box component="li" key={s.key} sx={{ borderBottom: `1px solid ${t.rule}` }}>
              {s.toggle ? (
                <FormControlLabel
                  control={<Checkbox size="small" checked={s.summary !== null} onChange={s.toggle} />}
                  label={s.label}
                  sx={{ m: 0, px: 3, py: 1, width: '100%', fontSize: '0.875rem' }}
                />
              ) : (
                <>
                  <ButtonBase
                    onClick={() => onExpand(isOpen ? null : s.key)}
                    aria-expanded={isOpen}
                    aria-controls={regionId}
                    sx={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 2, px: 4, minHeight: 48, textAlign: 'start', fontSize: '0.875rem',
                      '&:hover': { backgroundColor: t.brandTint }, '&.Mui-focusVisible': { outline: `2px solid ${t.focus}`, outlineOffset: -2 },
                    }}
                  >
                    <Box component="span" sx={{ fontWeight: 500 }}>{s.label}</Box>
                    <Box component="span" sx={{ flex: 1, minWidth: 0, textAlign: 'end', color: t.brand, fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.summary}
                    </Box>
                    <ChevronDown size={16} aria-hidden style={{ flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : undefined, transition: 'transform 160ms ease' }} />
                  </ButtonBase>
                  <Collapse in={isOpen} unmountOnExit timeout={160}>
                    <Box id={regionId} role="region" aria-label={s.label} sx={{ backgroundColor: t.paper }}>
                      {s.editor?.(() => onExpand(null))}
                    </Box>
                  </Collapse>
                </>
              )}
            </Box>
          );
        })}
      </Box>
      {narrow && (
        <Box sx={{ p: 3, borderTop: `1px solid ${t.rule}` }}>
          <Button fullWidth variant="contained" onClick={onClose} sx={{ minHeight: 44 }}><FormattedMessage id="register.done" /></Button>
        </Box>
      )}
    </>
  );
}

function rangeSummary(from: string | undefined, to: string | undefined, m: (id: string, v?: Record<string, string>) => string) {
  if (from && to) return m('register.filter.range', { from, to });
  if (from) return m('register.filter.atLeast', { value: from });
  if (to) return m('register.filter.atMost', { value: to });
  return null;
}

function FacetSkeleton() {
  return <Box sx={{ p: 3 }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={30} />)}</Box>;
}

function FacetList({ facet, filter, fixed, label, selected, searchable, onChange }: {
  facet: FacetKey;
  filter: RegisterFilter;
  fixed: readonly string[] | undefined;
  label: (v: string) => string;
  selected: readonly string[];
  searchable: boolean;
  onChange(next: string[]): void;
}) {
  const t = useTheme().tokens;
  const intl = useIntl();
  const [query, setQuery] = useState('');
  // Counts follow the filter one step behind, in a transition of their own: picking a value must
  // not hold the URL change (itself a transition) and the grid refetch until new counts arrive.
  // The old counts stay visible meanwhile.
  const [countsFilter, setCountsFilter] = useState(filter);
  useEffect(() => {
    startTransition(() => setCountsFilter(filter));
  }, [filter]);
  const data = useLazyLoadQuery<FilterBarFacetsQuery>(
    graphql`
      query FilterBarFacetsQuery($filter: LeaseFilter) {
        viewer {
          leaseFacets(filter: $filter) {
            status { value count }
            countryCode { value count }
            city { value count }
            propertyType { value count }
            currency { value count }
          }
        }
      }
    `,
    { filter: toGraphQLFilter(countsFilter) as FilterBarFacetsQuery['variables']['filter'] },
    { fetchPolicy: 'store-or-network' },
  );
  const counts = new Map((data.viewer?.leaseFacets[facet] ?? []).map((c) => [c.value, c.count]));
  const values = fixed ?? [...counts.keys()];
  const options: Option[] = [...new Set([...values, ...selected])]
    .map((v) => ({ value: v, label: label(v), count: counts.get(v) ?? 0 }))
    .filter((o) => !query || o.label.toLocaleLowerCase(intl.locale).includes(query.toLocaleLowerCase(intl.locale)));
  if (!fixed) options.sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.label.localeCompare(b.label, intl.locale));

  return (
    <Box>
      {searchable && (
        <Box sx={{ p: 3, pb: 1 }}>
          <TextField
            autoFocus
            fullWidth
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={intl.formatMessage({ id: 'register.filter.citySearch' })}
            slotProps={{ htmlInput: { 'aria-label': intl.formatMessage({ id: 'register.filter.citySearch' }) } }}
          />
        </Box>
      )}
      <Box component="ul" sx={{ listStyle: 'none', m: 0, py: 1.5, px: 0, maxHeight: 320, overflowY: 'auto' }}>
        {options.length === 0 && (
          <Box component="li" sx={{ px: 4, py: 3, color: t.inkSecondary, fontSize: '0.8125rem' }}>
            <FormattedMessage id="register.filter.noOptions" />
          </Box>
        )}
        {options.map((o) => {
          const checked = selected.includes(o.value);
          return (
            <Box component="li" key={o.value}>
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={checked}
                    onChange={() => onChange(checked ? selected.filter((v) => v !== o.value) : [...selected, o.value])}
                  />
                }
                label={
                  <Box sx={{ display: 'flex', width: '100%', gap: 3, fontSize: '0.875rem' }}>
                    <Box component="span" sx={{ flex: 1 }}>{o.label}</Box>
                    <Box component="span" data-num sx={{ color: t.inkTertiary, fontSize: '0.8125rem' }}>{intl.formatNumber(o.count ?? 0)}</Box>
                  </Box>
                }
                sx={{ m: 0, px: 2, py: 0.25, width: '100%', '& .MuiFormControlLabel-label': { flex: 1 }, '&:hover': { backgroundColor: t.brandTint } }}
              />
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

const WITHIN = [90, 180, 365];

function ExpiryForm({ filter, onApply }: { filter: RegisterFilter; onApply(next: RegisterFilter): void }) {
  const intl = useIntl();
  const initialMode = filter.expiry ? 'range' : String(filter.expiresWithinDays ?? 90);
  const [mode, setMode] = useState(initialMode);
  const [from, setFrom] = useState<Dayjs | null>(filter.expiry?.from ? dayjs(filter.expiry.from) : null);
  const [to, setTo] = useState<Dayjs | null>(filter.expiry?.to ? dayjs(filter.expiry.to) : null);
  const valid = mode !== 'range' || ((from === null || from.isValid()) && (to === null || to.isValid()) && (from !== null || to !== null));

  const apply = () => {
    const base = without(filter, 'expiresWithinDays', 'expiry');
    if (mode === 'range') {
      const expiry: { from?: string; to?: string } = {};
      if (from?.isValid()) expiry.from = from.format('YYYY-MM-DD');
      if (to?.isValid()) expiry.to = to.format('YYYY-MM-DD');
      onApply({ ...base, expiry });
    } else onApply({ ...base, expiresWithinDays: Number(mode) });
  };

  return (
    <Box sx={{ p: 4 }}>
      <RadioGroup value={mode} onChange={(e) => setMode(e.target.value)} aria-label={intl.formatMessage({ id: 'register.filter.expiry' })}>
        {WITHIN.map((d) => (
          <FormControlLabel key={d} value={String(d)} control={<Radio size="small" />} label={intl.formatMessage({ id: 'register.filter.within' }, { days: d })} />
        ))}
        <FormControlLabel value="range" control={<Radio size="small" />} label={intl.formatMessage({ id: 'register.filter.customRange' })} />
      </RadioGroup>
      {mode === 'range' && (
        <Suspense fallback={<Box sx={{ display: 'grid', gap: 3, mt: 2 }}><Skeleton variant="rounded" height={40} /><Skeleton variant="rounded" height={40} /></Box>}>
          <ExpiryRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        </Suspense>
      )}
      <Divider sx={{ my: 3 }} />
      <Button fullWidth variant="contained" onClick={apply} disabled={!valid}><FormattedMessage id="register.apply" /></Button>
    </Box>
  );
}

function RentForm({ filter, currency, onApply }: { filter: RegisterFilter; currency: string; onApply(next: RegisterFilter): void }) {
  const intl = useIntl();
  const [min, setMin] = useState(filter.annualRent?.min ?? '');
  const [max, setMax] = useState(filter.annualRent?.max ?? '');
  const ok = (v: string) => v === '' || /^\d{1,15}(\.\d{1,4})?$/.test(v.replace(/[,\s]/g, ''));
  const valid = ok(min) && ok(max) && (min !== '' || max !== '') && (min === '' || max === '' || Number(min.replace(/[,\s]/g, '')) <= Number(max.replace(/[,\s]/g, '')));
  const apply = () => {
    const annualRent: { min?: string; max?: string } = {};
    if (min) annualRent.min = min.replace(/[,\s]/g, '');
    if (max) annualRent.max = max.replace(/[,\s]/g, '');
    onApply({ ...without(filter, 'annualRent'), annualRent });
  };
  return (
    <Box component="form" sx={{ p: 4, display: 'grid', gap: 3 }} onSubmit={(e) => { e.preventDefault(); if (valid) apply(); }}>
      <Box sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
        <FormattedMessage id="register.filter.rentHelp" values={{ currency }} />
      </Box>
      <TextField label={intl.formatMessage({ id: 'register.filter.min' })} value={min} onChange={(e) => setMin(e.target.value)} error={!ok(min)} slotProps={{ htmlInput: { inputMode: 'decimal', dir: 'ltr' } }} autoFocus />
      <TextField label={intl.formatMessage({ id: 'register.filter.max' })} value={max} onChange={(e) => setMax(e.target.value)} error={!ok(max)} slotProps={{ htmlInput: { inputMode: 'decimal', dir: 'ltr' } }} />
      <Button type="submit" fullWidth variant="contained" disabled={!valid}><FormattedMessage id="register.apply" /></Button>
    </Box>
  );
}

function NextKeyForm({ filter, onApply }: { filter: RegisterFilter; onApply(next: RegisterFilter): void }) {
  const intl = useIntl();
  const [within, setWithin] = useState(String(filter.nextKeyWithinDays ?? 90));
  const [kinds, setKinds] = useState<KeyDateKind[]>(filter.nextKeyKind ?? []);
  const apply = () => {
    const next: RegisterFilter = { ...without(filter, 'nextKeyWithinDays', 'nextKeyKind'), nextKeyWithinDays: Number(within) };
    if (kinds.length) next.nextKeyKind = kinds;
    onApply(next);
  };
  return (
    <Box sx={{ p: 4 }}>
      <RadioGroup row value={within} onChange={(e) => setWithin(e.target.value)} aria-label={intl.formatMessage({ id: 'register.filter.nextKey' })}>
        {[30, 90, 180].map((d) => (
          <FormControlLabel key={d} value={String(d)} control={<Radio size="small" />} label={intl.formatMessage({ id: 'register.filter.withinShort' }, { days: d })} />
        ))}
      </RadioGroup>
      <Divider sx={{ my: 2 }} />
      <Box sx={{ display: 'grid' }}>
        {KINDS.map((k) => (
          <FormControlLabel
            key={k}
            control={<Checkbox size="small" checked={kinds.includes(k)} onChange={() => setKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k])} />}
            label={intl.formatMessage({ id: `keyDate.${k}` })}
          />
        ))}
      </Box>
      <Box sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 1, mb: 3 }}>
        {kinds.length === 0 && <FormattedMessage id="register.filter.anyKind" />}
      </Box>
      <Button fullWidth variant="contained" onClick={apply}><FormattedMessage id="register.apply" /></Button>
    </Box>
  );
}
