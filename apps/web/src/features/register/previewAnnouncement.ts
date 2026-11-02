import { useIntl } from 'react-intl';
import { useFormat } from '../../i18n/format.ts';
import type { RegisterRow } from './columns.tsx';

// What a screen reader hears when the preview is opened from the keyboard (the card itself is visual).
export function usePreviewAnnouncement() {
  const intl = useIntl();
  const f = useFormat();
  return (row: RegisterRow) => intl.formatMessage({ id: 'register.preview.announce' }, {
    reference: row.reference,
    property: row.propertyName,
    status: intl.formatMessage({ id: `status.${row.status}` }),
    expiry: f.date(row.expiryDate),
    rent: f.money(row.annualRent.amount, row.annualRent.currency, { whole: true }),
  });
}
