import { useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { useTheme } from '@mui/material/styles';
import { Plus, Trash2 } from 'lucide-react';
import type { OptionData } from '@tenuro/lease-rules';
import { EmptyNote } from '../../../components/DefinitionList.tsx';
import { FieldRow, Fieldset, FormCheckbox, FormDate, FormMoney, FormNumber, FormSelect, FormText } from '../fields.tsx';
import { useForm } from '../state.tsx';

const newOption = (): OptionData => ({ kind: 'BREAK', exerciseOn: '', noticeBy: '', termMonths: '', price: '', reasonablyCertain: false, terms: '' });

export function OptionsStep() {
  const intl = useIntl();
  const t = useTheme().tokens;
  const form = useForm();
  const options = form.state.data.options;
  const currency = form.state.data.rent.currency;
  const setOptions = (next: OptionData[]) => form.set('options', next);

  return (
    <Fieldset legend={intl.formatMessage({ id: 'leaseForm.field.options' })}>
      {options.length === 0 && <EmptyNote>{intl.formatMessage({ id: 'leaseForm.field.options.empty' })}</EmptyNote>}
      {options.map((o, i) => (
        <Box
          key={i}
          component="section"
          aria-label={`${intl.formatMessage({ id: `option.${o.kind}` })} ${i + 1}`}
          sx={{ border: `1px solid ${t.rule}`, borderRadius: 1, p: { xs: 4, sm: 5 }, display: 'grid', gap: 4, backgroundColor: t.surface }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 3 }}>
            <Box sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
              <Box component="span" data-num sx={{ color: t.inkTertiary, marginInlineEnd: 2 }}>{String(i + 1).padStart(2, '0')}</Box>
              {intl.formatMessage({ id: `option.${o.kind}` })}
            </Box>
            <Button
              size="small"
              variant="text"
              startIcon={<Trash2 size={14} />}
              onClick={() => setOptions(options.filter((_x, j) => j !== i))}
              disabled={form.readOnly}
              aria-label={intl.formatMessage({ id: 'leaseForm.field.options.remove' }, { n: i + 1 })}
            >
              {intl.formatMessage({ id: 'common.remove' })}
            </Button>
          </Box>
          <FieldRow columns={3}>
            <FormSelect path={`options.${i}.kind`} options={(['BREAK', 'RENEWAL', 'PURCHASE'] as const).map((v) => ({ value: v, label: intl.formatMessage({ id: `option.${v}` }) }))} />
            <FormDate path={`options.${i}.exerciseOn`} required />
            <FormDate path={`options.${i}.noticeBy`} required={o.kind !== 'PURCHASE'} optional={o.kind === 'PURCHASE'} />
          </FieldRow>
          {o.kind === 'RENEWAL' && <FieldRow columns={3}><FormNumber path={`options.${i}.termMonths`} required /></FieldRow>}
          {o.kind === 'PURCHASE' && <FieldRow columns={3}><FormMoney path={`options.${i}.price`} currency={currency} required /></FieldRow>}
          <FormCheckbox path={`options.${i}.reasonablyCertain`} />
          <FormText path={`options.${i}.terms`} optional multiline />
        </Box>
      ))}
      <Button variant="outlined" startIcon={<Plus size={15} />} onClick={() => setOptions([...options, newOption()])} disabled={form.readOnly || options.length >= 10} sx={{ justifySelf: 'start' }}>
        {intl.formatMessage({ id: 'leaseForm.field.options.add' })}
      </Button>
    </Fieldset>
  );
}
