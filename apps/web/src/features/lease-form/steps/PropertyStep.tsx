import { useIntl } from 'react-intl';
import { PropertyPicker } from '../../../components/PropertyPicker.tsx';
import type { PropertyPicker_viewer$key } from '../../../components/__generated__/PropertyPicker_viewer.graphql';
import { FieldRow, Fieldset, FormNumber, FormText } from '../fields.tsx';
import { fieldId } from '../model.ts';
import { useForm } from '../state.tsx';

export function PropertyStep({ viewer }: { viewer: PropertyPicker_viewer$key }) {
  const intl = useIntl();
  const form = useForm();
  const path = 'property.propertyId';
  const error = form.errorFor(path);
  return (
    <>
      <Fieldset legend={intl.formatMessage({ id: 'leaseForm.step.property' })}>
        <PropertyPicker
          viewer={viewer}
          id={fieldId(path)}
          label={intl.formatMessage({ id: 'leaseForm.field.property.propertyId' })}
          placeholder={intl.formatMessage({ id: 'leaseForm.field.property.propertyId.placeholder' })}
          helperText={intl.formatMessage({ id: 'leaseForm.field.property.propertyId.help' })}
          error={error}
          required
          disabled={form.readOnly}
          value={form.value<string | null>(path)}
          onChange={(id) => { form.set(path, id); form.touch(path); }}
          onBlur={() => form.touch(path)}
        />
      </Fieldset>
      <Fieldset legend={intl.formatMessage({ id: 'leaseForm.section.premises' })}>
        <FieldRow>
          <FormText path="property.premises" required />
          <FormNumber path="property.areaSqm" places={2} unit="m²" required />
        </FieldRow>
      </Fieldset>
    </>
  );
}
