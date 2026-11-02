import { lazy, Suspense, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { useIntl } from 'react-intl';
import { useNavigate } from 'react-router';
import Box from '@mui/material/Box';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { DataGrid, type GridColumnVisibilityModel, type GridSortModel, type useGridApiRef } from '@mui/x-data-grid';
import { cspNonce } from '../../app/nonce.ts';
import { GRID_FIELD, sortModelToOrder, useRegisterColumns, type RegisterRow } from './columns.tsx';
import { usePreviewAnnouncement } from './previewAnnouncement.ts';
import { DEFAULT_ORDER, type RegisterOrder } from './urlState.ts';

// The preview card loads on first use.
const LeasePreview = lazy(async () => ({ default: (await import('./LeasePreview.tsx')).LeasePreview }));

interface Props {
  rows: RegisterRow[];
  reportingCurrency: string;
  columns: GridColumnVisibilityModel;
  onColumnsChange(model: GridColumnVisibilityModel): void;
  orderBy: RegisterOrder[];
  onSortChange(orderBy: RegisterOrder[]): void;
  page: number;
  pageSize: number;
  apiRef: ReturnType<typeof useGridApiRef>;
  isPending: boolean;
  footer: ReactNode;
}

// The register as a data grid, on wider screens: sortable columns, keyboard navigation, the lease
// preview and its shortcuts. Loaded as its own chunk, since phones use the card list instead.
export function RegisterTable({ rows, reportingCurrency, columns, onColumnsChange, orderBy, onSortChange, page, pageSize, apiRef, isPending, footer }: Props) {
  const intl = useIntl();
  const theme = useTheme();
  const t = theme.tokens;
  const rtl = theme.direction === 'rtl';
  const navigate = useNavigate();
  const total = rows.length;
  const gridColumns = useRegisterColumns(reportingCurrency);
  const PAGE = pageSize;
  const state = { orderBy };

  // The lease preview: after a short hover on a row (pointers that hover), or Space on the focused row.
  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const [preview, setPreview] = useState<{ id: string; anchor: HTMLElement; byKeyboard: boolean } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const announce = usePreviewAnnouncement();
  const hoverTimer = useRef<number | undefined>(undefined);
  const canHover = useMediaQuery('(hover: hover) and (pointer: fine)', { noSsr: true });
  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);
  const anchorFor = (rowEl: HTMLElement) => rowEl.querySelector<HTMLElement>('[data-field="reference"]') ?? rowEl;
  const rowSlot = canHover ? {
    onMouseEnter: (e: ReactMouseEvent<HTMLElement>) => {
      const el = e.currentTarget;
      const id = el.getAttribute('data-id');
      window.clearTimeout(hoverTimer.current);
      if (!id) return;
      hoverTimer.current = window.setTimeout(() => setPreview({ id, anchor: anchorFor(el), byKeyboard: false }), 550);
    },
    onMouseLeave: () => {
      window.clearTimeout(hoverTimer.current);
      setPreview((p) => (p && !p.byKeyboard ? null : p));
    },
  } : {};

  // "/" moves to the register's search, as in most data-heavy tools.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      const search = document.querySelector<HTMLInputElement>('main input[type="search"]');
      if (!search) return;
      e.preventDefault();
      search.focus();
      search.select();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const sortModel = useMemo<GridSortModel>(() => {
    const o = state.orderBy[0] ?? DEFAULT_ORDER[0]!;
    const field = GRID_FIELD[o.field];
    return field ? [{ field, sort: o.direction === 'DESC' ? 'desc' : 'asc' }] : [];
  }, [state.orderBy]);

  // Horizontal overflow (when someone adds columns): the reference column stays put and the edges
  // with more columns beyond them carry a shadow, so a clipped grid always shows it scrolls.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  useEffect(() => {
    const scroller = wrapRef.current?.querySelector<HTMLElement>('.MuiDataGrid-virtualScroller');
    if (!scroller) return;
    const update = () => {
      const max = scroller.scrollWidth - scroller.clientWidth;
      const x = Math.abs(scroller.scrollLeft); // negative in right-to-left
      setEdges((prev) => {
        const next = { start: x > 1, end: max > 1 && x < max - 1 };
        return prev.start === next.start && prev.end === next.end ? prev : next;
      });
    };
    update();
    scroller.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(scroller);
    const content = scroller.firstElementChild;
    if (content) ro.observe(content);
    return () => {
      scroller.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [total, columns]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 360, border: `1px solid ${t.rule}`, borderRadius: 1, overflow: 'hidden', backgroundColor: t.surface }}>
      <Box
        ref={wrapRef}
        data-scroll-start={edges.start || undefined}
        data-scroll-end={edges.end || undefined}
        sx={{
          flex: 1, minHeight: 0, position: 'relative', opacity: isPending ? 0.55 : 1, transition: 'opacity 150ms ease',
          // Fade at the far edge while more columns lie beyond it.
          '&::after': {
            content: '""', position: 'absolute', top: 0, bottom: 0, insetInlineEnd: 0, width: 28, pointerEvents: 'none', zIndex: 4,
            background: `linear-gradient(to ${rtl ? 'right' : 'left'}, ${t.mode === 'dark' ? 'rgba(0,0,0,0.35)' : 'rgba(60,45,20,0.12)'}, transparent)`,
            opacity: edges.end ? 1 : 0, transition: 'opacity 150ms ease',
          },
        }}
      >
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
              return;
            }
            const id = String(params.id);
            if (event.key === ' ') {
              // Space previews the lease instead of selecting the row.
              event.preventDefault();
              (event as unknown as { defaultMuiPrevented?: boolean }).defaultMuiPrevented = true;
              if (preview?.id === id) { setPreview(null); setAnnouncement(''); return; }
              const rowEl = apiRef.current?.getRowElement(params.id);
              const row = rowById.get(id);
              if (rowEl && row) {
                setPreview({ id, anchor: anchorFor(rowEl), byKeyboard: true });
                setAnnouncement(announce(row));
              }
              return;
            }
            if (preview && (event.key === 'Escape' || event.key.startsWith('Arrow') || event.key === 'Tab')) {
              if (event.key === 'Escape') event.preventDefault();
              setPreview(null);
              setAnnouncement('');
            }
          }}
          slotProps={{ row: rowSlot }}
          aria-label={intl.formatMessage({ id: 'register.gridLabel' })}
          localeText={{ noRowsLabel: intl.formatMessage({ id: 'register.empty.title' }) }}
          sx={{
            '& .MuiDataGrid-row': { cursor: 'pointer', transition: 'background-color 120ms ease' },
            '& .MuiDataGrid-row:hover': { backgroundColor: t.brandTint },
            '& .MuiDataGrid-row:active': { backgroundColor: t.brandSoft },
            '& .MuiDataGrid-cell': { display: 'flex', alignItems: 'center' },
            // The last header's hidden menu button and resize handle spill past its edge, which gave
            // the grid sideways scroll. MUI clips that header only once the grid already scrolls
            // sideways; clip it always. (The hidden menu also shrinks to zero width; clip it too.)
            '& .MuiDataGrid-columnHeader--last': { overflow: 'hidden' },
            '& .MuiDataGrid-menuIcon': { overflow: 'hidden' },
            // The reference column sticks to the start edge (the free grid has no pinned columns).
            // Its background layers the row's hover tint over the surface, so it stays opaque.
            '& .MuiDataGrid-cell[data-field="reference"], & .MuiDataGrid-columnHeader[data-field="reference"]': {
              position: 'sticky', insetInlineStart: 0, zIndex: 3, backgroundColor: t.surface,
              boxShadow: edges.start ? `${rtl ? '-' : ''}6px 0 8px -6px ${t.mode === 'dark' ? 'rgba(0,0,0,0.6)' : 'rgba(60,45,20,0.25)'}` : 'none',
              transition: 'box-shadow 150ms ease',
            },
            '& .MuiDataGrid-row:hover .MuiDataGrid-cell[data-field="reference"]': { background: `linear-gradient(${t.brandTint}, ${t.brandTint}), ${t.surface}` },
            '& .MuiDataGrid-row:active .MuiDataGrid-cell[data-field="reference"]': { background: `linear-gradient(${t.brandSoft}, ${t.brandSoft}), ${t.surface}` },
            '@media (prefers-reduced-motion: reduce)': { '& .MuiDataGrid-row, & .MuiDataGrid-cell': { transition: 'none' } },
          }}
        />
      </Box>
      {footer}
      <Box role="status" aria-live="polite" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>{announcement}</Box>
      {preview && (
        <Suspense fallback={null}>
          <LeasePreview row={rowById.get(preview.id) ?? null} anchor={preview.anchor} />
        </Suspense>
      )}
    </Box>
  );
}
