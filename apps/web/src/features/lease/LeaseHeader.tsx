import { graphql, useFragment } from 'react-relay';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { ChevronRight, FlaskConical, ListPlus, PenLine } from 'lucide-react';
import type { LeaseHeader_lease$key } from './__generated__/LeaseHeader_lease.graphql';
import { StatusChip } from '../../components/StatusChip.tsx';
import { PropertyPhoto } from '../../components/PropertyPhoto.tsx';

export function LeaseHeader({ lease: ref, canEdit, onAddTask }: { lease: LeaseHeader_lease$key; canEdit: boolean; onAddTask: () => void }) {
  const lease = useFragment(
    graphql`
      fragment LeaseHeader_lease on Lease {
        id
        reference
        status
        premises
        propertyName
        city
        countryCode
        changedInSandbox
        property { photo district }
      }
    `,
    ref,
  );
  const intl = useIntl();
  const theme = useTheme();
  const t = theme.tokens;
  const rtl = theme.direction === 'rtl';
  const country = new Intl.DisplayNames([intl.locale], { type: 'region' }).of(lease.countryCode) ?? lease.countryCode;

  return (
    <Box component="header" sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) 200px', md: 'minmax(0, 1fr) 280px' }, gap: { xs: 5, sm: 6, md: 10 }, alignItems: 'end' }}>
      <Box sx={{ minWidth: 0 }}>
        <Box component="nav" aria-label="Breadcrumb" sx={{ mb: 4 }}>
          <Box component="ol" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, listStyle: 'none', m: 0, p: 0, fontSize: '0.8125rem', color: t.inkSecondary }}>
            <li><Link component={RouterLink} to="/leases" sx={{ color: t.inkSecondary, fontWeight: 500 }}><FormattedMessage id="lease.breadcrumb" /></Link></li>
            <Box component="li" aria-hidden sx={{ display: 'inline-flex', transform: rtl ? 'scaleX(-1)' : undefined }}><ChevronRight size={14} /></Box>
            <Box component="li" aria-current="page" sx={{ fontFamily: theme.typography.fontFamily }}><bdi>{lease.reference}</bdi></Box>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 3, mb: 2 }}>
          <Box component="span" sx={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', color: t.inkSecondary, letterSpacing: '0.02em' }}>
            <bdi>{lease.reference}</bdi>
          </Box>
          <StatusChip status={lease.status} size="small" />
          {lease.changedInSandbox && (
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, fontSize: '0.75rem', color: t.accent, fontWeight: 600 }}>
              <FlaskConical size={13} aria-hidden /> <FormattedMessage id="lease.changedInSandbox" />
            </Box>
          )}
        </Box>
        <Typography variant="h1" sx={{ fontSize: { xs: '1.75rem', md: '2.25rem' }, mb: 1.5 }}>{lease.propertyName}</Typography>
        <Typography color="text.secondary" sx={{ fontSize: '0.9375rem' }}>
          {lease.premises} · {[lease.property.district, lease.city, country].filter(Boolean).join(', ')}
        </Typography>
        {canEdit && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 5 }}>
            <Button component={RouterLink} to={`/leases/${encodeURIComponent(lease.id)}/amend`} variant="contained" startIcon={<PenLine size={16} strokeWidth={1.8} />}>
              <FormattedMessage id="lease.amend" />
            </Button>
            <Button variant="outlined" onClick={onAddTask} startIcon={<ListPlus size={16} strokeWidth={1.8} />}>
              <FormattedMessage id="lease.addTask" />
            </Button>
          </Box>
        )}
      </Box>
      {lease.property.photo && (
        <PropertyPhoto
          src={lease.property.photo}
          alt=""
          // Beside the title from tablet width up (a full-width photo pushed the lease's figures far down).
          sizes="(min-width: 900px) 280px, 200px"
          eager
          sx={{ aspectRatio: '3 / 2', borderRadius: 1, border: `1px solid ${t.rule}`, display: { xs: 'none', sm: 'block' } }}
        />
      )}
    </Box>
  );
}
