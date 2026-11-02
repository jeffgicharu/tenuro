import { FormattedMessage } from 'react-intl';
import { Link as RouterLink } from 'react-router';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

export function NotFound() {
  return (
    <Box sx={{ px: { xs: 4, md: 10 }, py: { xs: 10, md: 16 }, maxWidth: 640 }}>
      <Typography variant="overline" color="text.secondary" component="p">404</Typography>
      <Typography variant="h1" sx={{ mb: 3 }}><FormattedMessage id="common.notFound" /></Typography>
      <Typography color="text.secondary" sx={{ mb: 6 }}><FormattedMessage id="common.notFoundDetail" /></Typography>
      <Button component={RouterLink} to="/leases" variant="contained"><FormattedMessage id="common.goToLeases" /></Button>
    </Box>
  );
}
