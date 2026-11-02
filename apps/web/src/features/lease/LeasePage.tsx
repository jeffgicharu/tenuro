import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import type { LeasePageQuery } from './__generated__/LeasePageQuery.graphql';
import { leaseQuery } from './loader.ts';
import { useRouteQuery } from '../../app/relayRoute.ts';

export function LeasePage() {
  const data = useRouteQuery<LeasePageQuery>(leaseQuery);
  return (
    <Box sx={{ p: 8 }}>
      <Typography variant="h1">{data.node?.reference}</Typography>
    </Box>
  );
}
