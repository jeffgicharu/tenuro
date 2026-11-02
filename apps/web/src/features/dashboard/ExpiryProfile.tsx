import { graphql, useFragment } from 'react-relay';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import type { ExpiryProfile_portfolio$key } from './__generated__/ExpiryProfile_portfolio.graphql';
import { useFormat } from '../../i18n/format.ts';
import { Panel } from './Panel.tsx';

// Rent falling due by year of expiry: the lease-event risk at a glance. Each bar opens that year's
// leases in the register. Bars are plain elements, so each is a link with its full figure in words.
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
  const max = Math.max(1, ...p.expiryProfile.map((b) => Number(b.passingRent.amount)));

  return (
    <Panel title={<FormattedMessage id="dashboard.expiry.title" />} lede={<FormattedMessage id="dashboard.expiry.lede" />}>
      <Box
        component="ol"
        sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: `repeat(${p.expiryProfile.length}, minmax(0, 1fr))`, gap: { xs: 1.5, md: 3 }, alignItems: 'end', height: 260 }}
      >
        {p.expiryProfile.map((b, i) => {
          const share = Number(b.passingRent.amount) / max;
          const label = b.year === null ? intl.formatMessage({ id: 'dashboard.expiry.later' }, { year: b.from }) : String(b.year);
          const to = b.year === null
            ? `/leases?status=ACTIVE&expFrom=${b.from}-01-01&sort=EXPIRY_DATE.asc`
            : `/leases?status=ACTIVE&status=HOLDING_OVER&expTo=${b.year}-12-31${i === 0 ? '' : `&expFrom=${b.year}-01-01`}&sort=EXPIRY_DATE.asc`;
          const near = i === 0;
          return (
            <Box component="li" key={label} sx={{ height: '100%', minWidth: 0 }}>
              <Box
                component={RouterLink}
                to={to}
                sx={{
                  height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch',
                  color: 'inherit', textDecoration: 'none', borderRadius: 1, px: { xs: 0, md: 1 },
                  '&:hover .bar': { filter: 'brightness(1.08)' }, '&:hover .year': { color: t.ink },
                  '&:focus-visible': { outline: `2px solid ${t.focus}`, outlineOffset: 2 },
                }}
              >
                {/* The link's name is this sentence; the drawn figures below are hidden from assistive technology. */}
                <Box component="span" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
                  {intl.formatMessage({ id: 'dashboard.expiry.bar' }, {
                    year: label, rent: f.money(b.passingRent.amount, b.passingRent.currency, { compact: true }), count: b.leases,
                  })}
                </Box>
                {/* The plot area: bars scale to 85% of it, so the tallest leaves room for its figure. */}
                <Box aria-hidden sx={{ flex: 1, position: 'relative' }}>
                  <Box
                    data-num
                    sx={{
                      position: 'absolute', insetInline: 0, bottom: `calc(${share * 85}% + 4px)`, textAlign: 'center',
                      fontSize: { xs: '0.6875rem', md: '0.8125rem' }, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}
                  >
                    {f.money(b.passingRent.amount, b.passingRent.currency, { compact: true, showCode: false })}
                  </Box>
                  <Box
                    className="bar"
                    sx={{
                      position: 'absolute', insetInline: { xs: 2, md: 6 }, bottom: 0, height: `${share * 85}%`, minHeight: b.leases ? 3 : 1,
                      borderRadius: '3px 3px 0 0', backgroundColor: near ? t.warning : t.brand,
                      transformOrigin: 'bottom', transition: 'filter 140ms ease',
                      '@media (prefers-reduced-motion: no-preference)': {
                        animation: 'bar-rise 520ms cubic-bezier(0.2, 0, 0, 1) both', animationDelay: `${i * 50}ms`,
                        '@keyframes bar-rise': { from: { transform: 'scaleY(0)' }, to: { transform: 'scaleY(1)' } },
                      },
                    }}
                  />
                </Box>
                <Box aria-hidden sx={{ borderTop: `1px solid ${t.ruleStrong}`, pt: 1, textAlign: 'center' }}>
                  <Box className="year" data-num sx={{ fontSize: '0.8125rem', fontWeight: 600, color: t.inkSecondary }}>{label}</Box>
                  <Box data-num sx={{ fontSize: '0.6875rem', color: t.inkTertiary }}>
                    <FormattedMessage id="dashboard.expiry.leases" values={{ count: b.leases }} />
                  </Box>
                </Box>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Panel>
  );
}
