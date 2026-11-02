import { describe, expect, it } from 'vitest';
import { FormStepper, type StepperItem } from './FormStepper.tsx';
import { renderWithProviders } from '../test/render.tsx';

const items: StepperItem[] = [
  { key: 'parties', label: 'Parties', hint: 'Landlord, lessee and anyone else on the lease', state: 'complete', issues: 0 },
  { key: 'term', label: 'Term', hint: 'Dates', state: 'current', issues: 0 },
  { key: 'accounting', label: 'Accounting', hint: 'Inputs for IFRS 16 or ASC 842', state: 'untouched', issues: 0 },
];

describe('FormStepper', () => {
  // Regression: ButtonBase centres its content, so each circle moved with its label's width and the
  // connecting line zig-zagged. Every row now puts the circle in a fixed first grid column.
  it('keeps every step marker in a fixed first column, whatever the label width', () => {
    const { container } = renderWithProviders(<FormStepper items={items} current="term" onSelect={() => undefined} label="Form sections" />);
    const rows = [...container.querySelectorAll<HTMLElement>('[data-step-row]')];
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      const style = getComputedStyle(row);
      expect(style.display).toBe('grid');
      expect(style.gridTemplateColumns).toContain('31px');
      expect(row.firstElementChild).toHaveAttribute('data-step-marker');
    }
  });
});
