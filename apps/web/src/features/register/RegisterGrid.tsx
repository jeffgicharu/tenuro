import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { graphql, usePaginationFragment } from 'react-relay';
import { FormattedMessage, useIntl } from 'react-intl';
import { useNavigate } from 'react-router';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import { ChevronLeft, ChevronRight, ChevronsLeft } from 'lucide-react';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { DataGrid, useGridApiRef, type GridColumnVisibilityModel, type GridSortModel } from '@mui/x-data-grid';
import type { RegisterGrid_viewer$key } from './__generated__/RegisterGrid_viewer.graphql';
import { cspNonce } from '../../app/nonce.ts';
import { EmptyState } from '../../components/EmptyState.tsx';
import { GRID_FIELD, sortModelToOrder, useRegisterColumns, type RegisterRow } from './columns.tsx';
import { RegisterCards } from './RegisterCards.tsx';
import { DEFAULT_ORDER, stateKey, toGraphQLFilter, type RegisterOrder, type RegisterState } from './urlState.ts';

const PAGE = 100;

interface Props {
  viewer: RegisterGrid_viewer$key;
  state: RegisterState;
  reportingCurrency: string;
  columns: GridColumnVisibilityModel;
  onColumnsChange(model: GridColumnVisibilityModel): void;
  onSortChange(orderBy: RegisterOrder[]): void;
  onClearFilters(): void;
  onTotal(total: number): void;
  apiRef: ReturnType<typeof useGridApiRef>;
}

export function RegisterGrid({ viewer, state, reportingCurrency, columns, onColumnsChange, onSortChange, onClearFilters, onTotal, apiRef }: Props) {
  const { data, loadNext, hasNext, isLoadingNext, refetch } = usePaginationFragment(
    graphql`
      fragment RegisterGrid_viewer on Viewer
      @refetchable(queryName: "RegisterGridPaginationQuery")
      @argumentDefinitions(
        first: { type: "Int", defaultValue: 100 }
        after: { type: "String" }
        filter: { type: "LeaseFilter" }
        orderBy: { type: "[LeaseOrder!]" }
      ) {
        leases(first: $first, after: $after, filter: $filter, orderBy: $orderBy)
          @connection(key: "RegisterGrid_leases", filters: ["filter", "orderBy"]) {
          totalCount
          edges {
            node {
              id
              reference
              status
              propertyName
              city
              property { district }
              premises
              landlordName
              commencementDate
              expiryDate
              daysToExpiry
              annualRentReporting { amount currency }
              annualRent { amount currency }
              areaSqm
              nextKeyDate
              nextKeyKind
              propertyType
              countryCode
              costCentre
              changedInSandbox
            }
          }
        }
      }
    `,
    viewer,
  );
  const intl = useIntl();
  const theme = useTheme();
  const t = theme.tokens;
  const navigate = useNavigate();
  const narrow = useMediaQuery(theme.breakpoints.down('md'), { noSsr: true });
  const rtl = theme.direction === 'rtl';
  const [isPending, startTransition] = useTransition();
  const gridColumns = useRegisterColumns(reportingCurrency);

  // Refetch when the filters or sort in the URL change; the transition keeps the current rows on
  // screen (dimmed) until the new ones arrive.
  const key = stateKey(state);
  const lastKey = useRef(key);
  const [page, setPage] = useState(0);
  useEffect(() => {
    if (key === lastKey.current) return;
    lastKey.current = key;
    setPage(0);
    startTransition(() => {
      refetch({ first: PAGE, filter: toGraphQLFilter(state.filter), orderBy: state.orderBy }, { fetchPolicy: 'store-or-network' });
    });
  }, [key, refetch, state.filter, state.orderBy]);

  const rows = useMemo<RegisterRow[]>(
    () => data.leases.edges.map(({ node }) => ({ ...node, district: node.property.district ?? null })),
    [data.leases.edges],
  );
  const total = data.leases.totalCount;
  useEffect(() => onTotal(total), [total, onTotal]);

  // The free DataGrid shows at most 100 rows per page, so the register pages through cursor windows
  // of 100: each window is fetched once with loadNext and kept in the Relay store, earlier windows
  // are instant, and the window after the current one is prefetched so "Next" rarely waits.
  const pageCount = Math.max(1, Math.ceil(total / PAGE));
  const loadedPages = Math.ceil(rows.length / PAGE);
  useEffect(() => {
    if (!narrow && hasNext && !isLoadingNext && !isPending && page >= loadedPages - 1) loadNext(PAGE);
  }, [narrow, hasNext, isLoadingNext, isPending, page, loadedPages, loadNext]);
  const goTo = (next: number) => {
    const target = Math.max(0, Math.min(next, pageCount - 1));
    if (target < loadedPages) setPage(target);
    else if (hasNext && !isLoadingNext) loadNext(PAGE, { onComplete: (err) => { if (!err) setPage(target); } });
    apiRef.current?.scrollToIndexes({ rowIndex: 0 });
  };

  const sortModel = useMemo<GridSortModel>(() => {
    const o = state.orderBy[0] ?? DEFAULT_ORDER[0]!;
    const field = GRID_FIELD[o.field];
    return field ? [{ field, sort: o.direction === 'DESC' ? 'desc' : 'asc' }] : [];
  }, [state.orderBy]);

  if (total === 0) {
    return (
      <EmptyState
        title={intl.formatMessage({ id: 'register.empty.title' })}
        body={intl.formatMessage({ id: 'register.empty.body' })}
        action={<Button variant="outlined" onClick={onClearFilters}><FormattedMessage id="register.empty.clear" /></Button>}
      />
    );
  }

  const footer = (
    <Box
      sx={{
        display: 'flex', alignItems: 'center', gap: 3, minHeight: 40, px: 4, borderTop: `1px solid ${t.rule}`,
        backgroundColor: t.sunken, fontSize: '0.8125rem', color: t.inkSecondary, position: 'relative',
      }}
    >
      <Box role="status" aria-live="polite" data-num sx={{ flex: 1 }}>
        {narrow
          ? <FormattedMessage id="register.showing" values={{ shown: rows.length, total }} />
          : <FormattedMessage id="register.rows" values={{ from: page * PAGE + 1, to: Math.min((page + 1) * PAGE, total), total }} />}
        {(isLoadingNext || isPending) && (
          <Box component="span" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
            <FormattedMessage id={isPending ? 'register.updating' : 'register.loadingMore'} />
          </Box>
        )}
      </Box>
      {!narrow && pageCount > 1 && (
        <Box component="nav" aria-label={intl.formatMessage({ id: 'register.pages' })} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box component="span" data-num sx={{ marginInlineEnd: 2 }}>
            <FormattedMessage id="register.pageOf" values={{ page: page + 1, count: pageCount }} />
          </Box>
          <IconButton size="small" onClick={() => goTo(0)} disabled={page === 0} aria-label={intl.formatMessage({ id: 'register.firstPage' })}>
            <ChevronsLeft size={16} style={rtl ? { transform: 'scaleX(-1)' } : undefined} />
          </IconButton>
          <IconButton size="small" onClick={() => goTo(page - 1)} disabled={page === 0} aria-label={intl.formatMessage({ id: 'register.prevPage' })}>
            <ChevronLeft size={16} style={rtl ? { transform: 'scaleX(-1)' } : undefined} />
          </IconButton>
          <IconButton size="small" onClick={() => goTo(page + 1)} disabled={page >= pageCount - 1} aria-label={intl.formatMessage({ id: 'register.nextPage' })}>
            <ChevronRight size={16} style={rtl ? { transform: 'scaleX(-1)' } : undefined} />
          </IconButton>
        </Box>
      )}
      {(isLoadingNext || isPending) && <LinearProgress sx={{ position: 'absolute', insetInline: 0, top: -1, height: 2 }} aria-hidden />}
    </Box>
  );

  if (narrow) {
    return (
      <Box sx={{ opacity: isPending ? 0.55 : 1, transition: 'opacity 150ms ease' }}>
        <RegisterCards rows={rows} />
        {footer}
        {hasNext && (
          <Box sx={{ display: 'grid', p: 4 }}>
            <Button variant="outlined" onClick={() => loadNext(PAGE)} loading={isLoadingNext} sx={{ minHeight: 44 }}>
              <FormattedMessage id="register.loadMore" />
            </Button>
          </Box>
        )}
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 360, border: `1px solid ${t.rule}`, borderRadius: 1, overflow: 'hidden', backgroundColor: t.surface }}>
      <Box sx={{ flex: 1, minHeight: 0, opacity: isPending ? 0.55 : 1, transition: 'opacity 150ms ease' }}>
        <DataGrid<RegisterRow>
          apiRef={apiRef}
          // The grid writes its CSS variables into its own <style> tag, which the CSP refuses without the nonce.
          {...(cspNonce ? { nonce: cspNonce } : {})}
          rows={rows}
          columns={gridColumns}
          rowHeight={t.rowHeight + 14}
          columnHeaderHeight={t.rowHeight + 4}
          sortingMode="server"
          sortModel={sortModel}
          onSortModelChange={(model) => onSortChange(sortModelToOrder(model))}
          sortingOrder={['asc', 'desc']}
          paginationModel={{ page, pageSize: PAGE }}
          pageSizeOptions={[PAGE]}
          columnVisibilityModel={columns}
          onColumnVisibilityModelChange={onColumnsChange}
          disableColumnFilter
          disableRowSelectionOnClick
          disableColumnSelector={false}
          hideFooter
          rowBufferPx={400}
          onRowClick={({ id }) => navigate(`/leases/${encodeURIComponent(String(id))}`)}
          onCellKeyDown={(params, event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              navigate(`/leases/${encodeURIComponent(String(params.id))}`);
            }
          }}
          aria-label={intl.formatMessage({ id: 'register.gridLabel' })}
          localeText={{ noRowsLabel: intl.formatMessage({ id: 'register.empty.title' }) }}
          sx={{ '& .MuiDataGrid-row': { cursor: 'pointer' }, '& .MuiDataGrid-cell': { display: 'flex', alignItems: 'center' } }}
        />
      </Box>
      {footer}
    </Box>
  );
}
