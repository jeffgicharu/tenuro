import { useMemo, useState } from 'react';
import { graphql, useFragment } from 'react-relay';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link as RouterLink, useNavigate } from 'react-router';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import type { PortfolioMap_portfolio$key } from './__generated__/PortfolioMap_portfolio.graphql';
import { useFormat } from '../../i18n/format.ts';
import { Panel } from './Panel.tsx';
import { REGION_MAPS } from './regionMaps.ts';

const REGION_OF: Record<string, string> = {
  KE: 'EA', UG: 'EA', TZ: 'EA', RW: 'EA',
  AE: 'GULF', SA: 'GULF', BH: 'GULF', OM: 'GULF',
  GB: 'EU', FR: 'EU', DE: 'EU', NL: 'EU',
};

// Where the rent is, drawn: the company's countries over their neighbours, and a bubble per city
// sized by passing rent (area, not radius, follows rent). Each bubble opens that city's leases. The
// map is a picture; the ranked list beside it carries the same figures as links for everyone.
// Loaded on its own, after the rest of the overview.
export default function PortfolioMap({ portfolio: ref }: { portfolio: PortfolioMap_portfolio$key }) {
  const p = useFragment(
    graphql`
      fragment PortfolioMap_portfolio on Portfolio {
        rentByCity { city countryCode latitude longitude rent { leases share passingRent { amount currency } } }
      }
    `,
    ref,
  );
  const theme = useTheme();
  const t = theme.tokens;
  const f = useFormat();
  const intl = useIntl();
  const navigate = useNavigate();
  const [hover, setHover] = useState<string | null>(null);
  const country = useMemo(() => new Intl.DisplayNames([intl.locale], { type: 'region' }), [intl.locale]);

  const own = new Set(p.rentByCity.map((c) => c.countryCode));
  const votes = new Map<string, number>();
  for (const c of p.rentByCity) { const r = REGION_OF[c.countryCode]; if (r) votes.set(r, (votes.get(r) ?? 0) + 1); }
  const region = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const map = region ? REGION_MAPS[region] : undefined;
  if (!map) return null;
  const [, , w, h] = map.viewBox.split(' ').map(Number) as [number, number, number, number];
  const x = (lon: number) => ((lon - map.lon[0]) / (map.lon[1] - map.lon[0])) * w;
  const y = (lat: number) => ((map.lat[1] - lat) / (map.lat[1] - map.lat[0])) * h;
  const top = Math.max(0.0001, ...p.rentByCity.map((c) => Number(c.rent.share)));
  // Sizes in map units: the drawing is about 400 px tall on screen, roughly 0.4 of its viewBox.
  const radius = (share: number) => 10 + Math.sqrt(share / top) * 58;
  const font = Math.round(w * 0.03);
  const href = (city: string) => `/leases?city=${encodeURIComponent(city)}&status=ACTIVE&status=HOLDING_OVER`;
  // Smaller bubbles drawn last, so they stay clickable on top of large ones.
  const drawn = [...p.rentByCity].sort((a, b) => Number(b.rent.share) - Number(a.rent.share));
  // Up to five labels, largest city first, skipping any that would collide with one already placed
  // (Dubai, Sharjah and Abu Dhabi sit within a few millimetres of each other at this scale).
  const labelled = new Set<string>();
  const placed: { x: number; y: number; w: number }[] = [];
  for (const c of drawn) {
    if (labelled.size >= 5) break;
    const lx = x(Number(c.longitude));
    const ly = y(Number(c.latitude)) - radius(Number(c.rent.share)) - 8;
    const lw = c.city.length * font * 0.6;
    if (placed.some((q) => Math.abs(q.x - lx) < (q.w + lw) / 2 + font * 0.4 && Math.abs(q.y - ly) < font * 1.3)) continue;
    placed.push({ x: lx, y: ly, w: lw });
    labelled.add(c.city);
  }

  return (
    <Panel title={<FormattedMessage id="dashboard.map.title" />} lede={<FormattedMessage id="dashboard.map.lede" />}>
      <Box sx={{ display: 'grid', gap: 4, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) 240px' }, alignItems: 'start' }}>
        <Box
          component="svg"
          viewBox={map.viewBox}
          aria-hidden
          preserveAspectRatio="xMidYMid meet"
          sx={{
            width: '100%', maxHeight: 400, display: 'block', overflow: 'hidden', borderRadius: 1, backgroundColor: t.mode === 'dark' ? '#121a1f' : '#e9eef0',
            // Bubbles pop in once (styles go through emotion, which carries the CSP nonce).
            '@media (prefers-reduced-motion: no-preference)': {
              '& circle': { animation: 'map-pop 520ms cubic-bezier(0.2, 0, 0, 1) both' },
              '@keyframes map-pop': { from: { transform: 'scale(0)', opacity: 0 } },
            },
          }}
        >
          {map.countries.map((c, i) => (
            <path
              key={`${c.code}-${i}`}
              d={c.d}
              fill={own.has(c.code) ? t.brandSoft : t.sunken}
              stroke={own.has(c.code) ? t.brand : t.rule}
              strokeWidth={own.has(c.code) ? 1.6 : 1}
              strokeLinejoin="round"
            />
          ))}
          {drawn.map((c, i) => {
            const cx = x(Number(c.longitude));
            const cy = y(Number(c.latitude));
            const r = radius(Number(c.rent.share));
            const active = hover === c.city;
            return (
              <g key={c.city} style={{ cursor: 'pointer' }} onClick={() => navigate(href(c.city))} onMouseEnter={() => setHover(c.city)} onMouseLeave={() => setHover(null)}>
                <circle
                  cx={cx} cy={cy} r={r}
                  fill={t.brand} fillOpacity={active ? 0.75 : 0.45} stroke={t.brand} strokeWidth={active ? 3 : 1.5}
                  style={{ transformOrigin: `${cx}px ${cy}px`, animationDelay: `${i * 30}ms` }}
                />
                {(labelled.has(c.city) || active) && (
                  <text
                    x={cx} y={cy - r - 8} textAnchor="middle"
                    style={{ font: `600 ${active ? font * 1.15 : font}px ${theme.typography.body1.fontFamily as string}`, fill: t.ink, paintOrder: 'stroke', stroke: t.paper, strokeWidth: font / 4 } as React.CSSProperties}
                  >
                    {c.city}{active ? ` · ${f.money(c.rent.passingRent.amount, c.rent.passingRent.currency, { compact: true })}` : ''}
                  </text>
                )}
              </g>
            );
          })}
        </Box>
        <Box component="ol" aria-label={intl.formatMessage({ id: 'dashboard.map.cities' })} sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.5 }}>
          {drawn.slice(0, 8).map((c, i) => (
            <Box component="li" key={c.city}>
              <Box
                component={RouterLink}
                to={href(c.city)}
                onMouseEnter={() => setHover(c.city)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(c.city)}
                onBlur={() => setHover(null)}
                sx={{
                  display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr) auto', alignItems: 'baseline', columnGap: 2, py: 1.25, px: 1.5, borderRadius: 1,
                  color: 'inherit', textDecoration: 'none', fontSize: '0.8125rem', backgroundColor: hover === c.city ? t.brandTint : 'transparent',
                  '&:focus-visible': { outline: `2px solid ${t.focus}`, outlineOffset: 1 },
                }}
              >
                <Box component="span" data-num sx={{ color: t.inkTertiary, fontSize: '0.75rem' }}>{i + 1}</Box>
                <Box component="span" sx={{ minWidth: 0 }}>
                  <Box component="span" sx={{ display: 'block', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.city}</Box>
                  <Box component="span" sx={{ display: 'block', fontSize: '0.75rem', color: t.inkSecondary }}>
                    {country.of(c.countryCode) ?? c.countryCode} · <FormattedMessage id="dashboard.expiry.leases" values={{ count: c.rent.leases }} />
                  </Box>
                </Box>
                <Box component="span" data-num sx={{ fontWeight: 600 }}>{f.percent(c.rent.share, 0)}</Box>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    </Panel>
  );
}
