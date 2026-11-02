import { Suspense, useCallback, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link as RouterLink, useRevalidator, useSearchParams } from 'react-router';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { GridPreferencePanelsValue, useGridApiRef, type GridColumnVisibilityModel } from '@mui/x-data-grid';
import { Columns3, FilePlus2 } from 'lucide-react';
import type { RegisterPageQuery } from './__generated__/RegisterPageQuery.graphql';
import { useRouteQuery } from '../../app/relayRoute.ts';
import { EmptyState } from '../../components/EmptyState.tsx';
import { ErrorBoundary } from '../../components/ErrorBoundary.tsx';
import { DEFAULT_COLUMNS } from './columns.tsx';
import { FilterBar } from './FilterBar.tsx';
import { registerQuery } from './loader.ts';
import { RegisterGrid } from './RegisterGrid.tsx';
import { RegisterSkeleton } from './RegisterSkeleton.tsx';
import { SavedViewsBar } from './SavedViewsBar.tsx';
import {
  DEFAULT_ORDER, parseState, parseViewConfig, sanitiseViewFilters, toParams, type RegisterFilter, type RegisterOrder, type RegisterState,
} from './urlState.ts';

const COLUMNS_KEY = 'tenuro.register.columns';

function readColumns(): GridColumnVisibilityModel {
  try {
    const raw = window.localStorage.getItem(COLUMNS_KEY);
    return raw ? { ...DEFAULT_COLUMNS, ...(JSON.parse(raw) as GridColumnVisibilityModel) } : DEFAULT_COLUMNS;
  } catch {
    return DEFAULT_COLUMNS;
  }
}

function writeColumns(model: GridColumnVisibilityModel) {
  try {
    window.localStorage.setItem(COLUMNS_KEY, JSON.stringify(model));
  } catch {
    // Column choice then lasts only for this visit.
  }
}

export function RegisterPage() {
  const intl = useIntl();
  const revalidator = useRevalidator();
  return (
    <Box sx={{ px: { xs: 4, md: 8 }, pt: { xs: 5, md: 7 }, pb: { xs: 0, md: 6 }, display: 'flex', flexDirection: 'column', gap: 4, height: { md: 'calc(100dvh - 37px)' } }}>
      <ErrorBoundary
        onRetry={() => void revalidator.revalidate()}
        fallback={(retry) => (
          <EmptyState
            role="alert"
            title={intl.formatMessage({ id: 'register.error.title' })}
            body={intl.formatMessage({ id: 'register.error.body' })}
            action={<Button variant="contained" onClick={retry}><FormattedMessage id="common.retry" /></Button>}
          />
        )}
      >
        <Suspense
          fallback={
            <>
              <Typography variant="h1"><FormattedMessage id="register.title" /></Typography>
              <RegisterSkeleton />
            </>
          }
        >
          <RegisterContent />
        </Suspense>
      </ErrorBoundary>
    </Box>
  );
}

function RegisterContent() {
  const data = useRouteQuery<RegisterPageQuery>(registerQuery);
  return data.viewer ? <RegisterView viewer={data.viewer} /> : null;
}

export type RegisterViewer = NonNullable<RegisterPageQuery['response']['viewer']>;

export function RegisterView({ viewer }: { viewer: RegisterViewer }) {
  const theme = useTheme();
  const narrow = useMediaQuery(theme.breakpoints.down('md'), { noSsr: true });
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => parseState(params), [params]);
  const [columns, setColumns] = useState<GridColumnVisibilityModel>(readColumns);
  const [total, setTotal] = useState<number | null>(null);
  const apiRef = useGridApiRef();

  const commit = useCallback((next: RegisterState, replace = true) => setParams(toParams(next), { replace }), [setParams]);
  const setFilter = useCallback((filter: RegisterFilter) => commit({ filter, orderBy: state.orderBy, view: null }), [commit, state.orderBy]);
  const setOrder = useCallback((orderBy: RegisterOrder[]) => commit({ ...state, orderBy }), [commit, state]);
  const changeColumns = useCallback((model: GridColumnVisibilityModel) => {
    setColumns(model);
    writeColumns(model);
  }, []);

  const selectView = (view: { id: string; config: string } | null) => {
    if (!view) {
      commit({ filter: {}, orderBy: DEFAULT_ORDER, view: null }, false);
      return;
    }
    const config = parseViewConfig(view.config);
    const clean = sanitiseViewFilters(config.filters, config.sort);
    commit({ ...clean, view: view.id }, false);
    if (config.columns) changeColumns({ ...DEFAULT_COLUMNS, ...config.columns });
  };

  return (
    <>
      <Box component="header" sx={{ display: 'flex', alignItems: 'flex-end', gap: 4, flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h1"><FormattedMessage id="register.title" /></Typography>
          <Typography variant="body2" color="text.secondary" data-num sx={{ mt: 1, minHeight: 21 }}>
            {total !== null && <FormattedMessage id="register.count" values={{ count: total }} />}
          </Typography>
        </Box>
        {!narrow && (
          <Button
            variant="outlined"
            startIcon={<Columns3 size={16} strokeWidth={1.7} />}
            onClick={() => apiRef.current?.showPreferences(GridPreferencePanelsValue.columns)}
          >
            <FormattedMessage id="register.columns" />
          </Button>
        )}
        {viewer.canEdit && (
          <Button component={RouterLink} to="/leases/new" variant="contained" startIcon={<FilePlus2 size={16} strokeWidth={1.8} />}>
            <FormattedMessage id="register.newLease" />
          </Button>
        )}
      </Box>
      <SavedViewsBar
        viewer={viewer}
        activeViewId={state.view}
        onSelect={selectView}
        currentConfig={() => ({ filters: state.filter, sort: state.orderBy, columns })}
        onSaved={(id) => commit({ ...state, view: id }, false)}
      />
      <FilterBar filter={state.filter} onChange={setFilter} reportingCurrency={viewer.tenant.reportingCurrency} />
      <Box sx={{ flex: { md: 1 }, minHeight: 0, mx: { xs: -4, md: 0 } }}>
        <RegisterGrid
          viewer={viewer}
          state={state}
          reportingCurrency={viewer.tenant.reportingCurrency}
          columns={columns}
          onColumnsChange={changeColumns}
          onSortChange={setOrder}
          onClearFilters={() => setFilter({})}
          onTotal={setTotal}
          apiRef={apiRef}
        />
      </Box>
    </>
  );
}
