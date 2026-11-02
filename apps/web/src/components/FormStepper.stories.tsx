import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { FormStepper, type StepperItem } from './FormStepper.tsx';

const items: StepperItem[] = [
  { key: 'parties', label: 'Parties', hint: 'Landlord, lessee and anyone else', state: 'complete', issues: 0 },
  { key: 'property', label: 'Property', hint: 'Building and premises', state: 'issues', issues: 2 },
  { key: 'term', label: 'Term', hint: 'Start and end dates', state: 'current', issues: 0 },
  { key: 'rent', label: 'Rent', hint: 'Payments and reviews', state: 'untouched', issues: 0 },
  { key: 'accounting', label: 'Accounting', hint: 'IFRS 16 or ASC 842 inputs', state: 'untouched', issues: 0 },
  { key: 'review', label: 'Review', hint: 'Check and save', state: 'untouched', issues: 0 },
];

// The lease form's sections: a ruled list on wide screens, a select with progress on phones.
function Stepper({ compact }: { compact: boolean }) {
  const [current, setCurrent] = useState('term');
  return <FormStepper items={items.map((i) => ({ ...i, state: i.key === current ? 'current' : i.state === 'current' ? 'complete' : i.state }))} current={current} onSelect={setCurrent} label="Form sections" compact={compact} />;
}
const meta = { title: 'Components/FormStepper', parameters: { layout: 'padded' } } satisfies Meta;
export default meta;
export const Wide: StoryObj = { render: () => <div style={{ maxWidth: 320 }}><Stepper compact={false} /></div> };
export const Phone: StoryObj = { render: () => <div style={{ maxWidth: 360 }}><Stepper compact /></div> };
