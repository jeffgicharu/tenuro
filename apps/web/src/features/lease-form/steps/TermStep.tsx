import { useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import { isIsoDate, monthsInTerm } from '@tenuro/lease-rules';
import { FieldRow, Fieldset, FormDate } from '../fields.tsx';
import { useForm } from '../state.tsx';

export function TermStep() {
  const intl = useIntl();
  const t = useTheme().tokens;
  const { commencementDate: start, expiryDate: end } = useForm().state.data.term;
  const months = isIsoDate(start) && isIsoDate(end) && end > start ? monthsInTerm(start, end) : null;
  return (
    <Fieldset legend={intl.formatMessage({ id: 'leaseForm.section.dates' })}>
      <FieldRow>
        <FormDate path="term.commencementDate" required />
        <FormDate path="term.expiryDate" required />
      </FieldRow>
      {months !== null && (
        <Box aria-live="polite" sx={{ display: 'flex', alignItems: 'baseline', gap: 3, pt: 2 }}>
          <Box sx={{ color: t.inkSecondary, fontSize: '0.8125rem' }}>{intl.formatMessage({ id: 'leaseForm.review.term' })}</Box>
          <Box data-num sx={{ fontFamily: (th) => th.typography.h3.fontFamily, fontSize: '1.25rem', color: t.ink }}>
            {intl.formatMessage({ id: 'leaseForm.review.termValue' }, { months })}
            {months >= 12 && (
              <Box component="span" sx={{ color: t.inkSecondary, fontSize: '0.875rem', marginInlineStart: 2 }}>
                ({intl.formatNumber(months / 12, { style: 'unit', unit: 'year', unitDisplay: 'long', maximumFractionDigits: 1 })})
              </Box>
            )}
          </Box>
        </Box>
      )}
    </Fieldset>
  );
}
