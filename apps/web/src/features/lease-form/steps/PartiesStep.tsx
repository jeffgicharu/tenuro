import { useIntl } from 'react-intl';
import Button from '@mui/material/Button';
import { Plus, X } from 'lucide-react';
import { emptyParty } from '@tenuro/lease-rules';
import { FieldRow, Fieldset, FormText } from '../fields.tsx';
import { useForm } from '../state.tsx';

function PartyFields({ role }: { role: 'landlord' | 'guarantor' | 'agent' }) {
  const base = `parties.${role}`;
  return (
    <>
      <FormText path={`${base}.name`} required />
      <FieldRow columns={3}>
        <FormText path={`${base}.contactName`} optional />
        <FormText path={`${base}.email`} optional />
        <FormText path={`${base}.phone`} optional />
      </FieldRow>
    </>
  );
}

export function PartiesStep() {
  const intl = useIntl();
  const form = useForm();
  const { guarantor, agent } = form.state.data.parties;
  const toggle = (role: 'guarantor' | 'agent', on: boolean) => form.set(`parties.${role}`, on ? emptyParty() : null);
  const removeButton = (role: 'guarantor' | 'agent') => (
    <Button size="small" variant="text" startIcon={<X size={14} />} onClick={() => toggle(role, false)} disabled={form.readOnly}>
      {intl.formatMessage({ id: 'leaseForm.section.removeParty' }, { role: intl.formatMessage({ id: `leaseForm.section.${role}` }).toLowerCase() })}
    </Button>
  );
  return (
    <>
      <Fieldset legend={intl.formatMessage({ id: 'leaseForm.section.landlord' })}>
        <PartyFields role="landlord" />
      </Fieldset>
      <Fieldset legend={intl.formatMessage({ id: 'leaseForm.section.lessee' })}>
        <FormText path="parties.lesseeEntity" required />
      </Fieldset>
      {guarantor ? (
        <Fieldset legend={intl.formatMessage({ id: 'leaseForm.section.guarantor' })} action={removeButton('guarantor')}>
          <PartyFields role="guarantor" />
        </Fieldset>
      ) : null}
      {agent ? (
        <Fieldset legend={intl.formatMessage({ id: 'leaseForm.section.agent' })} action={removeButton('agent')}>
          <PartyFields role="agent" />
        </Fieldset>
      ) : null}
      {(!guarantor || !agent) && (
        <FieldRow>
          {!guarantor && (
            <Button variant="outlined" startIcon={<Plus size={15} />} onClick={() => toggle('guarantor', true)} disabled={form.readOnly} sx={{ justifySelf: 'start' }}>
              {intl.formatMessage({ id: 'leaseForm.section.addGuarantor' })}
            </Button>
          )}
          {!agent && (
            <Button variant="outlined" startIcon={<Plus size={15} />} onClick={() => toggle('agent', true)} disabled={form.readOnly} sx={{ justifySelf: 'start' }}>
              {intl.formatMessage({ id: 'leaseForm.section.addAgent' })}
            </Button>
          )}
        </FieldRow>
      )}
    </>
  );
}
