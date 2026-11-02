import { useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { useTheme } from '@mui/material/styles';
import { Plus, Trash2 } from 'lucide-react';
import type { DepositData } from '@tenuro/lease-rules';
import { EmptyNote } from '../../../components/DefinitionList.tsx';
import { FieldRow, Fieldset, FormDate, FormMoney, FormSelect, FormText } from '../fields.tsx';
import { useForm } from '../state.tsx';

export function DepositsStep() {
  const intl = useIntl();
  const t = useTheme().tokens;
  const form = useForm();
  const { deposits, rent, parties } = form.state.data;
  const setDeposits = (next: DepositData[]) => form.set('deposits', next);
  const add = () => setDeposits([...deposits, { kind: 'CASH', amount: '', heldBy: parties.landlord.name, returnDueOn: '' }]);

  return (
    <Fieldset legend={intl.formatMessage({ id: 'leaseForm.field.deposits' })}>
      {deposits.length === 0 && <EmptyNote>{intl.formatMessage({ id: 'leaseForm.field.deposits.empty' })}</EmptyNote>}
      {deposits.map((d, i) => (
        <Box key={i} component="section" aria-label={`${intl.formatMessage({ id: `deposit.${d.kind}` })} ${i + 1}`} sx={{ border: `1px solid ${t.rule}`, borderRadius: 1, p: { xs: 4, sm: 5 }, display: 'grid', gap: 4, backgroundColor: t.surface }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 3 }}>
            <Box sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
              <Box component="span" data-num sx={{ color: t.inkTertiary, marginInlineEnd: 2 }}>{String(i + 1).padStart(2, '0')}</Box>
              {intl.formatMessage({ id: `deposit.${d.kind}` })}
            </Box>
            <Button size="small" variant="text" startIcon={<Trash2 size={14} />} onClick={() => setDeposits(deposits.filter((_x, j) => j !== i))} disabled={form.readOnly}
              aria-label={intl.formatMessage({ id: 'leaseForm.field.deposits.remove' }, { n: i + 1 })}>
              {intl.formatMessage({ id: 'common.remove' })}
            </Button>
          </Box>
          <FieldRow>
            <FormSelect path={`deposits.${i}.kind`} options={(['CASH', 'BANK_GUARANTEE', 'LETTER_OF_CREDIT'] as const).map((v) => ({ value: v, label: intl.formatMessage({ id: `deposit.${v}` }) }))} />
            <FormMoney path={`deposits.${i}.amount`} currency={rent.currency} required />
          </FieldRow>
          <FieldRow>
            <FormText path={`deposits.${i}.heldBy`} required />
            <FormDate path={`deposits.${i}.returnDueOn`} optional />
          </FieldRow>
        </Box>
      ))}
      <Button variant="outlined" startIcon={<Plus size={15} />} onClick={add} disabled={form.readOnly || deposits.length >= 5} sx={{ justifySelf: 'start' }}>
        {intl.formatMessage({ id: 'leaseForm.field.deposits.add' })}
      </Button>
    </Fieldset>
  );
}
