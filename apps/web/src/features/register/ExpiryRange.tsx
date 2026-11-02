import { useIntl } from 'react-intl';
import type { Dayjs } from 'dayjs';
import Box from '@mui/material/Box';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';

// The date pickers are heavy and only the "between dates" choice needs them, so this loads on demand.
export default function ExpiryRange({ from, to, onFrom, onTo }: { from: Dayjs | null; to: Dayjs | null; onFrom(v: Dayjs | null): void; onTo(v: Dayjs | null): void }) {
  const intl = useIntl();
  return (
    <Box sx={{ display: 'grid', gap: 3, mt: 2 }}>
      <DatePicker label={intl.formatMessage({ id: 'register.filter.from' })} value={from} onChange={onFrom} slotProps={{ textField: { size: 'small' } }} />
      <DatePicker
        label={intl.formatMessage({ id: 'register.filter.to' })}
        value={to}
        onChange={onTo}
        {...(from ? { minDate: from } : {})}
        slotProps={{ textField: { size: 'small' } }}
      />
    </Box>
  );
}
