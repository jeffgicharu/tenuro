import { graphql, useFragment } from 'react-relay';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import { useTheme } from '@mui/material/styles';
import type { ExpiryProfile_portfolio$key } from './__generated__/ExpiryProfile_portfolio.graphql';
import { useFormat } from '../../i18n/format.ts';
import { Panel } from './Panel.tsx';

// Bars use 85% of the plot height, so the tallest leaves room for its figure.
const SCALE = 0.85;
const LABELS = { xs: 28, md: 40 };

// A round number at or above the largest bar, for two quiet gridlines (half and full).
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

// Rent falling due by year of expiry, ten years ahead and then everything later: the lease-event
// risk at a glance. Each bar opens that year's leases in the register.
export function ExpiryProfile({ portfolio: ref }: { portfolio: ExpiryProfile_portfolio$key }) {
  const p = useFragment(
    graphql`
      fragment ExpiryProfile_portfolio on Portfolio {
        expiryProfile { year from leases passingRent { amount currency } }
      }
    `,
    ref,
  );
  const theme = useTheme();
  const t = theme.tokens;
  const f = useFormat();
  const intl = useIntl();
  const values = p.expiryProfile.map((b) => Number(b.passingRent.amount));
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0) || 1;
  const top = values.indexOf(max);
  const currency = p.expiryProfile[0]?.passingRent.currency ?? '';
  const nice = niceCeil(max);
  const ticks = [nice / 2, nice].filter((v) => v <= max * 1.001);
  const plotBottom = (frac: number, label: number) => `calc(${label}px + (100% - ${label}px) * ${SCALE * frac})`;

  return (
    <Panel title={<FormattedMessage id="dashboard.expiry.title" />} lede={<FormattedMessage id="dashboard.expiry.lede" />}>
      <Box sx={{ position: 'relative', flex: 1, minHeight: 260, display: 'flex' }}>
        {/* Gridlines with their values, behind the bars. */}
        {ticks.map((v) => (
          <Box
            key={v}
            aria-hidden
            sx={{
              position: 'absolute', insetInline: 0, borderTop: `1px dashed ${t.rule}`, pointerEvents: 'none',
              bottom: { xs: plotBottom(v / max, LABELS.xs), md: plotBottom(v / max, LABELS.md) },
            }}
          >
            <Box component="span" data-num sx={{ position: 'absolute', insetInlineStart: 0, bottom: 2, fontSize: '0.625rem', color: t.inkTertiary, backgroundColor: t.surface, paddingInlineEnd: 1 }}>
              {f.money(String(v), currency, { compact: true, showCode: false })}
            </Box>
          </Box>
        ))}
        <Box
          component="ol"
          sx={{ listStyle: 'none', m: 0, p: 0, flex: 1, display: 'grid', gridTemplateColumns: `repeat(${p.expiryProfile.length}, minmax(0, 1fr))`, gap: { xs: 0.5, md: 2 }, position: 'relative' }}
        >
          {p.expiryProfile.map((b, i) => {
            const share = values[i]! / max;
            const label = b.year === null ? intl.formatMessage({ id: 'dashboard.expiry.later' }, { year: b.from }) : String(b.year);
            const to = b.year === null
              ? `/leases?status=ACTIVE&expFrom=${b.from}-01-01&sort=EXPIRY_DATE.asc`
              : `/leases?status=ACTIVE&status=HOLDING_OVER&expTo=${b.year}-12-31${i === 0 ? '' : `&expFrom=${b.year}-01-01`}&sort=EXPIRY_DATE.asc`;
            const near = i === 0;
            const rent = f.money(b.passingRent.amount, b.passingRent.currency, { compact: true });
            const sentence = intl.formatMessage({ id: 'dashboard.expiry.bar' }, { year: label, rent, count: b.leases });
            const tip = intl.formatMessage({ id: 'dashboard.expiry.tip' }, { year: label, rent, count: b.leases, share: f.percent(values[i]! / total, 0) });
            // On a phone only the tallest bar and this year carry a figure; every bar has a tooltip.
            const showValueOnPhone = i === top || near;
            return (
              <Box component="li" key={label} sx={{ minWidth: 0, display: 'flex' }}>
                {/* describeChild: the tooltip describes the link; it must not replace its name. */}
                <Tooltip title={tip} placement="top" disableInteractive describeChild>
                  <Box
                    component={RouterLink}
                    to={to}
                    sx={{
                      flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', color: 'inherit', textDecoration: 'none', borderRadius: 1, position: 'relative',
                      '&:hover .bar, &:focus-visible .bar': { filter: 'brightness(1.1)' }, '&:hover .year': { color: t.ink },
                      '&:focus-visible': { outline: `2px solid ${t.focus}`, outlineOffset: 2 },
                    }}
                  >
                    <Box component="span" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>{sentence}</Box>
                    <Box aria-hidden sx={{ flex: 1, position: 'relative' }}>
                      <Box
                        data-num
                        sx={{
                          position: 'absolute', insetInline: '-12px', bottom: `calc(${share * SCALE * 100}% + 4px)`, textAlign: 'center',
                          fontSize: { xs: '0.625rem', md: '0.75rem' }, fontWeight: 600, whiteSpace: 'nowrap',
                          display: { xs: showValueOnPhone ? 'block' : 'none', md: 'block' },
                        }}
                      >
                        {f.money(b.passingRent.amount, b.passingRent.currency, { compact: true, showCode: false })}
                      </Box>
                      <Box
                        className="bar"
                        sx={{
                          position: 'absolute', insetInline: { xs: 1, md: 3 }, bottom: 0, height: `${share * SCALE * 100}%`, minHeight: b.leases ? 3 : 1,
                          borderRadius: '3px 3px 0 0', backgroundColor: near ? t.warning : t.brand,
                          transformOrigin: 'bottom', transition: 'filter 140ms ease',
                          '@media (prefers-reduced-motion: no-preference)': {
                            animation: 'bar-rise 520ms cubic-bezier(0.2, 0, 0, 1) both', animationDelay: `${i * 40}ms`,
                            '@keyframes bar-rise': { from: { transform: 'scaleY(0)' }, to: { transform: 'scaleY(1)' } },
                          },
                        }}
                      />
                    </Box>
                    <Box aria-hidden sx={{ height: { xs: LABELS.xs, md: LABELS.md }, borderTop: `1px solid ${t.ruleStrong}`, pt: 0.75, textAlign: 'center' }}>
                      <Box className="year" data-num sx={{ fontSize: { xs: '0.5625rem', md: '0.75rem' }, fontWeight: 600, color: t.inkSecondary, whiteSpace: 'nowrap' }}>{label}</Box>
                      <Box data-num sx={{ display: { xs: 'none', md: 'block' }, fontSize: '0.625rem', color: t.inkTertiary }}>{f.number(b.leases)}</Box>
                    </Box>
                  </Box>
                </Tooltip>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Panel>
  );
}
