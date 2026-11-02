import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import type { RegisterPageQuery } from './__generated__/RegisterPageQuery.graphql';
import { registerQuery } from './loader.ts';
import { useRouteQuery } from '../../app/relayRoute.ts';

export function RegisterPage() {
  const data = useRouteQuery<RegisterPageQuery>(registerQuery);
  return (
    <Box sx={{ p: 8 }}>
      <Typography variant="h1">Leases</Typography>
      <Typography data-num>{data.viewer?.leases.totalCount}</Typography>
    </Box>
  );
}
