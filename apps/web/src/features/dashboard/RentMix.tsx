import { useMemo } from 'react';
import { graphql, useFragment } from 'react-relay';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import type { RentMix_portfolio$key } from './__generated__/RentMix_portfolio.graphql';
import { useFormat } from '../../i18n/format.ts';
import { Panel } from './Panel.tsx';

// Where the rent is: by country as ranked bars, by property type as one proportional strip. Shares
// are printed, so nothing depends on telling colours apart.
export function RentMix({ portfolio: ref }: { portfolio: RentMix_portfolio$key }) {
  const p = useFragment(
    graphql`
      fragment RentMix_portfolio on Portfolio {
        rentByCountry { countryCode rent { leases share passingRent { amount currency } } }
        rentByType { propertyType rent { leases share passingRent { amount currency } } }
      }
    `,
    ref,
  );
  const theme = useTheme();
  const t = theme.tokens;
  const f = useFormat();
  const intl = useIntl();
  const country = useMemo(() => new Intl.DisplayNames([intl.locale], { type: 'region' }), [intl.locale]);
  const top = Math.max(0.0001, ...p.rentByCountry.map((c) => Number(c.rent.share)));

  return (
    <Panel title={<FormattedMessage id="dashboard.country.title" />} lede={<FormattedMessage id="dashboard.country.lede" />}>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 3 }}>
        {p.rentByCountry.map((c, i) => (
          <Box component="li" key={c.countryCode}>
            <Box
              component={RouterLink}
              to={`/leases?country=${c.countryCode}&status=ACTIVE&status=HOLDING_OVER`}
              sx={{
                display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: 3, rowGap: 1, color: 'inherit', textDecoration: 'none',
                borderRadius: 1, '&:hover .name': { color: t.brand }, '&:focus-visible': { outline: `2px solid ${t.focus}`, outlineOffset: 3 },
              }}
            >
              <Box className="name" sx={{ fontSize: '0.875rem', fontWeight: 500, transition: 'color 120ms ease', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {country.of(c.countryCode) ?? c.countryCode}
              </Box>
              <Box data-num sx={{ fontSize: '0.8125rem', color: t.inkSecondary, whiteSpace: 'nowrap' }}>
                <bdi>{f.money(c.rent.passingRent.amount, c.rent.passingRent.currency, { compact: true })}</bdi>
                <Box component="span" sx={{ color: t.ink, fontWeight: 600, marginInlineStart: 2 }}>{f.percent(c.rent.share, 0)}</Box>
              </Box>
              <Box aria-hidden sx={{ gridColumn: '1 / -1', height: 6, borderRadius: 3, backgroundColor: t.sunken, overflow: 'hidden' }}>
                <Box
                  sx={{
                    height: '100%', width: `${(Number(c.rent.share) / top) * 100}%`, borderRadius: 3, backgroundColor: t.brand,
                    transformOrigin: theme.direction === 'rtl' ? 'right' : 'left',
                    '@media (prefers-reduced-motion: no-preference)': {
                      animation: 'bar-grow 520ms cubic-bezier(0.2, 0, 0, 1) both', animationDelay: `${120 + i * 50}ms`,
                      '@keyframes bar-grow': { from: { transform: 'scaleX(0)' }, to: { transform: 'scaleX(1)' } },
                    },
                  }}
                />
              </Box>
            </Box>
          </Box>
        ))}
      </Box>

      <Box component="h3" sx={{ fontSize: '0.8125rem', fontWeight: 600, color: t.inkSecondary, mt: 6, mb: 2 }}>
        <FormattedMessage id="dashboard.type.title" />
      </Box>
      <Box aria-hidden sx={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', gap: '2px', mb: 3 }}>
        {p.rentByType.map((s, i) => (
          <Box key={s.propertyType} sx={{ flexGrow: Number(s.rent.share), flexBasis: 0, minWidth: 3, backgroundColor: t.chart[i % t.chart.length] }} />
        ))}
      </Box>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 1.5 }}>
        {p.rentByType.map((s, i) => (
          <Box component="li" key={s.propertyType} sx={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: '0.8125rem' }}>
            <Box aria-hidden sx={{ width: 10, height: 10, borderRadius: '2px', flexShrink: 0, backgroundColor: t.chart[i % t.chart.length] }} />
            <Box component="span" sx={{ flex: 1, minWidth: 0 }}><FormattedMessage id={`propertyType.${s.propertyType}`} /></Box>
            <Box component="span" data-num sx={{ fontWeight: 600 }}>{f.percent(s.rent.share, 0)}</Box>
          </Box>
        ))}
      </Box>
    </Panel>
  );
}
