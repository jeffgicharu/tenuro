import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { FormStepper, type StepperItem } from './FormStepper.tsx';

const STATES: [string, StepperItem['state'], number][] = [
  ['parties', 'complete', 0], ['property', 'issues', 2], ['term', 'current', 0], ['rent', 'untouched', 0], ['accounting', 'untouched', 0], ['review', 'untouched', 0],
];

// The lease form's sections: a ruled list on wide screens, a select with progress on phones. The
// labels come from the form's own catalogue, in each language.
function Stepper({ compact }: { compact: boolean }) {
  const m = useIntl().formatMessage;
  const [current, setCurrent] = useState('term');
  const items: StepperItem[] = STATES.map(([key, state, issues]) => ({
    key, label: m({ id: `leaseForm.step.${key}` }), hint: m({ id: `leaseForm.stepHint.${key}` }),
    state: key === current ? 'current' : state === 'current' ? 'complete' : state, issues,
  }));
  return <FormStepper items={items} current={current} onSelect={setCurrent} label={m({ id: 'leaseForm.stepper.label' })} compact={compact} />;
}
const meta = { title: 'Components/FormStepper', parameters: { layout: 'padded' } } satisfies Meta;
export default meta;
export const Wide: StoryObj = { render: () => <div style={{ maxWidth: 320 }}><Stepper compact={false} /></div> };
export const Phone: StoryObj = { render: () => <div style={{ maxWidth: 360 }}><Stepper compact /></div> };
