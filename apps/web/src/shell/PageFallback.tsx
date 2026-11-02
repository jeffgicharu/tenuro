import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import { useIntl } from 'react-intl';

// Shown while a route's code and data arrive: a thin bar, no layout jump.
export function PageFallback() {
  const intl = useIntl();
  return (
    <Box role="status" aria-label={intl.formatMessage({ id: 'app.loading' })} sx={{ position: 'relative', height: 2 }}>
      <LinearProgress sx={{ height: 2, backgroundColor: 'transparent' }} />
    </Box>
  );
}
