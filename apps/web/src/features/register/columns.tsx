import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import { useTheme } from '@mui/material/styles';
import type { GridColDef, GridColumnVisibilityModel } from '@mui/x-data-grid';
import { Money } from '../../components/Money.tsx';
import { StatusChip, type LeaseStatus } from '../../components/StatusChip.tsx';
import { useFormat } from '../../i18n/format.ts';
import { FONT_MONO } from '../../theme/theme.ts';
import { DEFAULT_ORDER, type OrderField, type RegisterOrder } from './urlState.ts';

export interface RegisterRow {
  readonly id: string;
  readonly reference: string;
  readonly status: LeaseStatus;
  readonly propertyName: string;
  readonly city: string;
  readonly district: string | null;
  readonly premises: string;
  readonly landlordName: string;
  readonly commencementDate: string;
  readonly expiryDate: string;
  readonly daysToExpiry: number;
  readonly annualRentReporting: { readonly amount: string; readonly currency: string };
  readonly annualRent: { readonly amount: string; readonly currency: string };
  readonly areaSqm: string;
  readonly nextKeyDate: string | null | undefined;
  readonly nextKeyKind: string | null | undefined;
  readonly propertyType: string;
  readonly countryCode: string;
  readonly costCentre: string | null | undefined;
  readonly changedInSandbox: boolean;
}

// Grid column -> server sort field. Columns without one are not sortable (e.g. mixed currencies).
export const SORT_FIELD: Record<string, OrderField> = {
  reference: 'REFERENCE', property: 'PROPERTY_NAME', landlord: 'LANDLORD', status: 'STATUS',
  commencementDate: 'COMMENCEMENT_DATE', expiryDate: 'EXPIRY_DATE', annualRentReporting: 'ANNUAL_RENT',
  areaSqm: 'AREA', nextKeyDate: 'NEXT_KEY_DATE', countryCode: 'COUNTRY',
};
export const GRID_FIELD: Partial<Record<OrderField, string>> = Object.fromEntries(Object.entries(SORT_FIELD).map(([k, v]) => [v, k]));

// The free grid sorts on one column at a time; an unsortable or cleared column falls back to the default.
export function sortModelToOrder(model: readonly { field: string; sort?: 'asc' | 'desc' | null | undefined }[]): RegisterOrder[] {
  const s = model[0];
  const field = s?.sort ? SORT_FIELD[s.field] : undefined;
  return s && field ? [{ field, direction: s.sort === 'desc' ? 'DESC' : 'ASC' }] : DEFAULT_ORDER;
}

// The defaults fit a 1440 px screen with the navigation open; the rest are a click away in Columns.
// Premises also shows under the property name, and passing rent on the lease page.
export const DEFAULT_COLUMNS: GridColumnVisibilityModel = {
  premises: false, landlord: true, commencementDate: false, annualRent: false, areaSqm: false,
  propertyType: false, countryCode: false, costCentre: false,
};

const Secondary = ({ children }: { children: React.ReactNode }) => {
  const t = useTheme().tokens;
  return <Box component="span" sx={{ display: 'block', fontSize: '0.75rem', color: t.inkSecondary, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</Box>;
};

// Truncated text gets a tooltip with the full value, but only when it is actually cut off.
function Ellipsis({ children }: { children: string }) {
  const [clipped, setClipped] = useState(false);
  return (
    <Tooltip title={clipped ? children : ''} placement="top-start" enterDelay={300} disableInteractive>
      <Box
        component="span"
        onMouseEnter={(e: React.MouseEvent<HTMLElement>) => setClipped(e.currentTarget.scrollWidth > e.currentTarget.clientWidth)}
        sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}
      >
        {children}
      </Box>
    </Tooltip>
  );
}

const Stack = ({ children }: { children: React.ReactNode }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0, height: '100%', lineHeight: 1.35 }}>{children}</Box>
);

export function useRegisterColumns(reportingCurrency: string): GridColDef<RegisterRow>[] {
  const intl = useIntl();
  const f = useFormat();
  const t = useTheme().tokens;
  const country = useMemo(() => new Intl.DisplayNames([intl.locale], { type: 'region' }), [intl.locale]);

  return useMemo<GridColDef<RegisterRow>[]>(() => {
    const m = (id: string, values?: Record<string, string>) => intl.formatMessage({ id }, values);
    return [
      {
        field: 'reference', headerName: m('register.col.reference'), width: 120, sortable: true,
        renderCell: ({ row, tabIndex }) => (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, height: '100%' }}>
            <Box
              component={RouterLink}
              to={`/leases/${encodeURIComponent(row.id)}`}
              tabIndex={tabIndex}
              aria-label={m('register.openLease', { reference: row.reference })}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              sx={{ fontFamily: FONT_MONO, fontSize: '0.8125rem', fontWeight: 500, color: t.ink, textDecoration: 'none', direction: 'ltr', '&:hover': { color: t.brand, textDecoration: 'underline' } }}
            >
              {row.reference}
            </Box>
            {row.changedInSandbox && <Box component="span" title="•" aria-hidden sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: t.accent, flexShrink: 0 }} />}
          </Box>
        ),
      },
      {
        field: 'property', headerName: m('register.col.property'), flex: 1.4, minWidth: 200,
        valueGetter: (_v, row) => row.propertyName,
        renderCell: ({ row }) => (
          <Stack>
            <Box component="span" sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.propertyName}</Box>
            <Secondary>{[row.premises, row.city].filter(Boolean).join(' · ')}</Secondary>
          </Stack>
        ),
      },
      {
        field: 'premises', headerName: m('register.col.premises'), flex: 0.8, minWidth: 120, sortable: false,
        renderCell: ({ row }) => <Ellipsis>{row.premises}</Ellipsis>,
      },
      {
        field: 'landlord', headerName: m('register.col.landlord'), flex: 1, minWidth: 140, valueGetter: (_v, row) => row.landlordName,
        renderCell: ({ row }) => <Ellipsis>{row.landlordName}</Ellipsis>,
      },
      {
        field: 'status', headerName: m('register.col.status'), width: 124,
        renderCell: ({ row }) => <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}><StatusChip status={row.status} size="small" /></Box>,
      },
      {
        field: 'commencementDate', headerName: m('register.col.commencement'), width: 128,
        renderCell: ({ row }) => <span data-num>{f.date(row.commencementDate)}</span>,
      },
      {
        field: 'expiryDate', headerName: m('register.col.expiry'), width: 132,
        renderCell: ({ row }) => {
          const soon = row.daysToExpiry >= 0 && row.daysToExpiry < 90 && row.status !== 'EXPIRED' && row.status !== 'TERMINATED';
          return (
            <Stack>
              <span data-num>{f.date(row.expiryDate)}</span>
              <Secondary>
                <Box component="span" sx={soon ? { color: t.warning, fontWeight: 600 } : undefined}>{f.relativeDays(row.daysToExpiry)}</Box>
              </Secondary>
            </Stack>
          );
        },
      },
      {
        field: 'annualRentReporting', headerName: m('register.col.annualRent', { currency: reportingCurrency }), width: 136,
        type: 'number', align: 'right', headerAlign: 'right',
        valueGetter: (_v, row) => row.annualRentReporting.amount,
        // The header names the currency, so cells show whole units without repeating it.
        renderCell: ({ row }) => <Money value={row.annualRentReporting} whole showCode={false} sx={{ fontWeight: 500 }} />,
      },
      {
        field: 'annualRent', headerName: m('register.col.passingRent'), width: 148, sortable: false,
        type: 'number', align: 'right', headerAlign: 'right',
        valueGetter: (_v, row) => row.annualRent.amount,
        renderCell: ({ row }) => <Money value={row.annualRent} whole sx={{ color: t.inkSecondary }} />,
      },
      {
        field: 'areaSqm', headerName: m('register.col.area'), width: 110, type: 'number', align: 'right', headerAlign: 'right',
        valueGetter: (_v, row) => row.areaSqm,
        renderCell: ({ row }) => <span data-num>{f.area(row.areaSqm)}</span>,
      },
      {
        field: 'nextKeyDate', headerName: m('register.col.nextKey'), width: 156,
        renderCell: ({ row }) => row.nextKeyDate ? (
          <Stack>
            <span data-num>{f.date(row.nextKeyDate)}</span>
            <Secondary>{row.nextKeyKind ? m(`keyDate.${row.nextKeyKind}`) : ''}</Secondary>
          </Stack>
        ) : <Box component="span" sx={{ color: t.inkTertiary }}>—</Box>,
      },
      {
        field: 'propertyType', headerName: m('register.col.type'), width: 120, sortable: false,
        valueGetter: (_v, row) => m(`propertyType.${row.propertyType}`),
      },
      {
        field: 'countryCode', headerName: m('register.col.country'), width: 140,
        valueGetter: (_v, row) => country.of(row.countryCode) ?? row.countryCode,
      },
      { field: 'costCentre', headerName: m('register.col.costCentre'), width: 130, sortable: false, valueGetter: (_v, row) => row.costCentre ?? '' },
    ];
  }, [intl, f, t, country, reportingCurrency]);
}
