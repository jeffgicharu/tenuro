import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import type { LeaseFormPageQuery } from './__generated__/LeaseFormPageQuery.graphql';
import { leaseFormQuery } from './loader.ts';
import { useRouteQuery } from '../../app/relayRoute.ts';

export function LeaseFormPage() {
  const data = useRouteQuery<LeaseFormPageQuery>(leaseFormQuery);
  return (
    <Box sx={{ p: 8 }}>
      <Typography variant="h1">New lease</Typography>
      <pre>{data.viewer?.newLeaseTemplate}</pre>
    </Box>
  );
}
