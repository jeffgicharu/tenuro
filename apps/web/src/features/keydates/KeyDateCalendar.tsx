import { useMemo } from 'react';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { FormattedMessage, useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import { useTheme } from '@mui/material/styles';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { KeyDateCalendarQuery } from './__generated__/KeyDateCalendarQuery.graphql';
import { addDaysIso, KINDS, type GraphQLKeyDateFilter, kindColour } from './urlState.ts';

// A month of key dates: each day shows how many are due and a dot per kind; overdue days are marked.
// Picking a day lists its dates beneath. The week starts on the locale's first day (Saturday or
// Sunday in the Gulf, Monday elsewhere), and the grid mirrors in right-to-left.
export function KeyDateCalendar({ month, day, filter, onMonth, onDay }: {
  month: string; day: string | null; filter: GraphQLKeyDateFilter; onMonth(m: string): void; onDay(d: string | null): void;
}) {
  const theme = useTheme();
  const t = theme.tokens;
  const intl = useIntl();
  const rtl = theme.direction === 'rtl';
  const first = `${month}-01`;
  const last = addDaysIso(`${shiftMonth(month, 1)}-01`, -1);
  const { from, to, ...rest } = filter;
  void from; void to;
  const data = useLazyLoadQuery<KeyDateCalendarQuery>(
    graphql`
      query KeyDateCalendarQuery($from: Date!, $to: Date!, $filter: KeyDateFilter) {
        viewer { keyDateCalendar(from: $from, to: $to, filter: $filter) { date total overdue kinds { kind count } } }
      }
    `,
    { from: first, to: last, filter: rest as KeyDateCalendarQuery['variables']['filter'] },
    { fetchPolicy: 'store-or-network' },
  );
  const byDay = useMemo(() => new Map((data.viewer?.keyDateCalendar ?? []).map((d) => [d.date, d])), [data]);
  const firstDay = weekStart(intl.locale);
  const weekendDays = weekend(intl.locale);
  const lead = (new Date(`${first}T00:00:00Z`).getUTCDay() - firstDay + 7) % 7;
  const days = Number(last.slice(8));
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
  while (cells.length % 7) cells.push(null);
  const weekday = new Intl.DateTimeFormat(intl.locale, { weekday: 'short', timeZone: 'UTC' });
  const heads = Array.from({ length: 7 }, (_, i) => weekday.format(new Date(Date.UTC(2024, 0, 7 + ((firstDay + i) % 7)))));
  const title = new Intl.DateTimeFormat(intl.locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${first}T00:00:00Z`));
  const today = new Date().toISOString().slice(0, 10);
  const max = Math.max(1, ...[...byDay.values()].map((d) => d.total));

  return (
    <Box sx={{ border: `1px solid ${t.rule}`, borderRadius: 1.5, backgroundColor: t.surface, p: { xs: 3, md: 5 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
        <IconButton aria-label={intl.formatMessage({ id: 'keyDates.prevMonth' })} onClick={() => onMonth(shiftMonth(month, -1))}>
          <ChevronLeft size={18} style={rtl ? { transform: 'scaleX(-1)' } : undefined} />
        </IconButton>
        <Box component="h2" aria-live="polite" sx={{ ...theme.typography.h3, m: 0, flex: 1, textAlign: 'center' }}>{title}</Box>
        <IconButton aria-label={intl.formatMessage({ id: 'keyDates.nextMonth' })} onClick={() => onMonth(shiftMonth(month, 1))}>
          <ChevronRight size={18} style={rtl ? { transform: 'scaleX(-1)' } : undefined} />
        </IconButton>
      </Box>
      {/* Plain buttons in a seven-column layout: each names its full date and count, so the weekday
          headings are only visual. */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: { xs: 0.5, md: 1 } }}>
        <Box aria-hidden sx={{ display: 'contents' }}>
          {heads.map((h) => <Box key={h} sx={{ textAlign: 'center', fontSize: '0.6875rem', fontWeight: 600, color: t.inkTertiary, pb: 1, textTransform: 'uppercase' }}>{h}</Box>)}
        </Box>
        {Array.from({ length: cells.length / 7 }, (_, w) => (
          <Box key={w} sx={{ display: 'contents' }}>
            {cells.slice(w * 7, w * 7 + 7).map((d, i) => {
              if (!d) return <Box key={`e${w}-${i}`} aria-hidden />;
              const info = byDay.get(d);
              const picked = day === d;
              const isToday = d === today;
              const weekend = weekendDays.includes(new Date(`${d}T00:00:00Z`).getUTCDay());
              const label = intl.formatMessage({ id: 'keyDates.dayLabel' }, { date: intl.formatDate(`${d}T00:00:00Z`, { dateStyle: 'full', timeZone: 'UTC' }), count: info?.total ?? 0 });
              return (
                <Box key={d}>
                  <ButtonBase
                    onClick={() => onDay(picked ? null : d)}
                    aria-pressed={picked}
                    sx={{
                      width: '100%', minHeight: { xs: 48, md: 84 }, borderRadius: 1, display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start', p: { xs: 0.75, md: 1.5 },
                      // The company colour, stronger with the count; weekends sit on the sunken tone.
                      border: `1px solid ${picked ? t.brand : isToday ? t.ink : t.rule}`,
                      backgroundColor: picked ? t.brandSoft : info ? `color-mix(in srgb, ${t.brand} ${Math.round(10 + (info.total / max) * 32)}%, ${weekend ? t.sunken : t.surface})` : weekend ? t.sunken : t.surface,
                      transition: 'background-color 120ms ease, border-color 120ms ease', '&:hover': { borderColor: t.brand },
                      '&.Mui-focusVisible': { outline: `2px solid ${t.focus}`, outlineOffset: 1 },
                    }}
                  >
                    <Box component="span" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>{label}</Box>
                    <Box aria-hidden sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1 }}>
                      <Box component="span" data-num sx={{ fontSize: '0.8125rem', fontWeight: isToday ? 700 : 500 }}>{Number(d.slice(8))}</Box>
                      {/* Overdue counts sit on a surface pill, so the danger colour keeps its contrast however strong the tint gets. */}
                      {info && (
                        <Box
                          component="span"
                          data-num
                          sx={{
                            fontSize: { xs: '0.625rem', md: '0.75rem' }, fontWeight: 600, lineHeight: 1.5,
                            ...(info.overdue ? { color: t.danger, backgroundColor: t.surface, border: `1px solid ${t.danger}`, borderRadius: 999, px: 0.75 } : { color: t.ink }),
                          }}
                        >
                          {info.total}
                        </Box>
                      )}
                    </Box>
                    {info && (
                      <Box aria-hidden sx={{ display: { xs: 'none', md: 'flex' }, flexWrap: 'wrap', gap: '3px', mt: 'auto' }}>
                        {info.kinds.map((k) => (
                          <Box key={k.kind} component="span" sx={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: kindColour(t.mode, k.kind) }} />
                        ))}
                      </Box>
                    )}
                  </ButtonBase>
                </Box>
              );
            })}
          </Box>
        ))}
      </Box>
      <Box aria-hidden sx={{ display: { xs: 'none', md: 'flex' }, flexWrap: 'wrap', gap: 3, mt: 4, fontSize: '0.75rem', color: t.inkSecondary }}>
        {KINDS.map((k) => (
          <Box key={k} sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
            <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: kindColour(t.mode, k) }} />
            <FormattedMessage id={`keyDate.${k}`} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}


export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

// The locale's weekend days (0 = Sunday): Friday and Saturday in the Gulf, else Saturday and Sunday.
function weekend(locale: string): number[] {
  try {
    const l = new Intl.Locale(locale) as Intl.Locale & { getWeekInfo?: () => { weekend: number[] }; weekInfo?: { weekend: number[] } };
    const info = l.getWeekInfo?.() ?? l.weekInfo;
    if (info) return info.weekend.map((d) => d % 7);
  } catch { /* fall through */ }
  return locale.startsWith('ar') ? [5, 6] : [6, 0];
}

// The locale's first day of the week (0 = Sunday), where the browser knows it; Monday otherwise.
function weekStart(locale: string): number {
  try {
    const l = new Intl.Locale(locale) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };
    const info = l.getWeekInfo?.() ?? l.weekInfo;
    if (info) return info.firstDay % 7;
  } catch { /* fall through */ }
  return locale.startsWith('ar') ? 6 : 1;
}
