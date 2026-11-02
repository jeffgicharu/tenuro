import { useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { useTheme } from '@mui/material/styles';
import { Plus, Trash2 } from 'lucide-react';
import { CURRENCIES, type LeaseFormData } from '@tenuro/lease-rules';
import { FieldRow, Fieldset, FormDate, FormMoney, FormNumber, FormPercent, FormSelect, FormText } from '../fields.tsx';
import { useForm } from '../state.tsx';

export function RentStep() {
  const intl = useIntl();
  const t = useTheme().tokens;
  const form = useForm();
  const rent = form.state.data.rent;
  const kind = rent.escalation.kind;
  const period = intl.formatMessage({ id: `frequency.perPeriod.${rent.paymentFrequency}` });
  const currencyName = new Intl.DisplayNames([intl.locale], { type: 'currency' });

  const setSteps = (steps: LeaseFormData['rent']['steps']) => form.set('rent.steps', steps);

  return (
    <>
      <Fieldset legend={intl.formatMessage({ id: 'leaseForm.section.payments' })}>
        <FieldRow columns={3}>
          <FormSelect path="rent.currency" required options={CURRENCIES.map((c) => ({ value: c, label: `${c} · ${currencyName.of(c) ?? c}` }))} />
          <FormSelect path="rent.paymentFrequency" required options={(['MONTHLY', 'QUARTERLY', 'ANNUAL'] as const).map((v) => ({ value: v, label: intl.formatMessage({ id: `frequency.${v}` }) }))} />
          <FormSelect path="rent.paymentTiming" required options={(['ADVANCE', 'ARREARS'] as const).map((v) => ({ value: v, label: intl.formatMessage({ id: `timing.${v}` }) }))} />
        </FieldRow>
        <FieldRow>
          <FormMoney path="rent.rentPerPeriod" currency={rent.currency} required help={intl.formatMessage({ id: 'leaseForm.field.rent.rentPerPeriod.help' }, { period })} />
          <FormMoney path="rent.serviceChargePerPeriod" currency={rent.currency} optional />
        </FieldRow>
      </Fieldset>

      <Fieldset legend={intl.formatMessage({ id: 'leaseForm.section.escalation' })} hint={intl.formatMessage({ id: `leaseForm.field.rent.escalation.help.${kind}` })}>
        <FieldRow>
          <FormSelect path="rent.escalation.kind" options={(['NONE', 'FIXED', 'CPI', 'MARKET_REVIEW'] as const).map((v) => ({ value: v, label: intl.formatMessage({ id: `escalation.${v}` }) }))} />
        </FieldRow>
        {kind !== 'NONE' && (
          <FieldRow columns={kind === 'FIXED' ? 3 : 2}>
            {kind === 'FIXED' && <FormPercent path="rent.escalation.ratePercent" required />}
            <FormNumber path="rent.escalation.everyMonths" required />
            <FormDate path="rent.escalation.firstReviewOn" required />
          </FieldRow>
        )}
        {kind === 'CPI' && (
          <FieldRow columns={3}>
            <FormText path="rent.escalation.indexName" required placeholder={intl.formatMessage({ id: 'leaseForm.field.rent.escalation.indexName.placeholder' })} />
            <FormPercent path="rent.escalation.capPercent" optional />
            <FormPercent path="rent.escalation.collarPercent" optional />
          </FieldRow>
        )}
      </Fieldset>

      <Fieldset legend={intl.formatMessage({ id: 'leaseForm.section.steps' })} hint={intl.formatMessage({ id: 'leaseForm.section.stepsHint' })}>
        {rent.steps.map((_s, i) => (
          <Box key={i} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr auto', sm: '1fr 1fr auto' }, gap: 4, alignItems: 'start', pb: 4, borderBottom: `1px dashed ${t.rule}` }}>
            <FormDate path={`rent.steps.${i}.startsOn`} required />
            <Box sx={{ gridColumn: { xs: '1 / 2', sm: 'auto' }, gridRow: { xs: 2, sm: 'auto' } }}>
              <FormMoney path={`rent.steps.${i}.rentPerPeriod`} currency={rent.currency} required />
            </Box>
            <Tooltip title={intl.formatMessage({ id: 'leaseForm.field.rent.steps.remove' }, { n: i + 1 })}>
              <span>
                <IconButton
                  aria-label={intl.formatMessage({ id: 'leaseForm.field.rent.steps.remove' }, { n: i + 1 })}
                  onClick={() => setSteps(rent.steps.filter((_x, j) => j !== i))}
                  disabled={form.readOnly}
                  sx={{ width: 40, height: 40 }}
                >
                  <Trash2 size={16} strokeWidth={1.6} />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        ))}
        <Button
          variant="outlined"
          startIcon={<Plus size={15} />}
          onClick={() => setSteps([...rent.steps, { startsOn: '', rentPerPeriod: '' }])}
          disabled={form.readOnly || rent.steps.length >= 40}
          sx={{ justifySelf: 'start' }}
        >
          {intl.formatMessage({ id: 'leaseForm.field.rent.steps.add' })}
        </Button>
      </Fieldset>
    </>
  );
}
