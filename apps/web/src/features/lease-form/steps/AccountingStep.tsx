import { useIntl } from 'react-intl';
import { FieldRow, Fieldset, FormCheckbox, FormMoney, FormNumber, FormPercent, FormSelect, FormText } from '../fields.tsx';
import { useForm } from '../state.tsx';

export function AccountingStep() {
  const intl = useIntl();
  const form = useForm();
  const { accounting, rent } = form.state.data;
  const c = rent.currency;
  return (
    <>
      <Fieldset legend={intl.formatMessage({ id: 'leaseForm.section.measurement' })}>
        <FieldRow>
          <FormPercent path="accounting.discountRatePercent" required />
          <FormNumber path="accounting.usefulLifeMonths" optional />
        </FieldRow>
        <FormCheckbox path="accounting.ownershipTransfers" />
      </Fieldset>
      <Fieldset legend={intl.formatMessage({ id: 'leaseForm.section.costs' })}>
        <FieldRow>
          <FormMoney path="accounting.initialDirectCosts" currency={c} optional />
          <FormMoney path="accounting.incentives" currency={c} optional />
        </FieldRow>
        <FieldRow>
          <FormMoney path="accounting.prepayments" currency={c} optional />
          <FormMoney path="accounting.restorationCost" currency={c} optional />
        </FieldRow>
      </Fieldset>
      <Fieldset legend={intl.formatMessage({ id: 'leaseForm.section.classification' })}>
        <FieldRow>
          <FormSelect
            path="accounting.standard"
            options={(['IFRS16', 'ASC842'] as const).map((v) => ({ value: v, label: intl.formatMessage({ id: `leaseForm.choice.standard.${v}` }) }))}
          />
          {accounting.standard === 'ASC842' ? (
            <FormSelect
              path="accounting.asc842Class"
              required
              options={(['FINANCE', 'OPERATING'] as const).map((v) => ({ value: v, label: intl.formatMessage({ id: `leaseForm.choice.class.${v}` }) }))}
            />
          ) : <span />}
        </FieldRow>
        <FieldRow>
          <FormSelect
            path="accounting.exemption"
            options={(['NONE', 'SHORT_TERM', 'LOW_VALUE'] as const).map((v) => ({ value: v, label: intl.formatMessage({ id: `leaseForm.choice.exemption.${v}` }) }))}
          />
          <FormText path="accounting.costCentre" optional />
        </FieldRow>
      </Fieldset>
    </>
  );
}
