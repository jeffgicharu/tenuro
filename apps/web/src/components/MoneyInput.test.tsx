import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { formatDecimalForDisplay, MoneyInput, normaliseDecimal } from './MoneyInput.tsx';
import { renderWithProviders } from '../test/render.tsx';

describe('normaliseDecimal', () => {
  it('keeps the exact digits typed, without grouping', () => {
    expect(normaliseDecimal('1,250,000.50', 2)).toBe('1250000.50');
    expect(normaliseDecimal('1 250 000,', 2)).toBe('1250000');
  });

  it('accepts Arabic-Indic digits and the Arabic decimal separator', () => {
    expect(normaliseDecimal('١٢٥٠٠٠٠٫٥٠', 2)).toBe('1250000.50');
    expect(normaliseDecimal('۱۲۳', 2)).toBe('123');
  });

  it('drops digits beyond the currency minor unit, and decimals for UGX', () => {
    expect(normaliseDecimal('4500000.5', 0)).toBe('4500000');
    expect(normaliseDecimal('12.3456', 2)).toBe('12.34');
    expect(normaliseDecimal('1250.125', 3)).toBe('1250.125');
  });

  it('never goes through a float, even past 2^53', () => {
    expect(normaliseDecimal('9007199254740993.25', 2)).toBe('9007199254740993.25');
  });
});

describe('formatDecimalForDisplay', () => {
  it('groups digits and keeps the decimals that were typed', () => {
    expect(formatDecimalForDisplay('1250000.50', 'en-GB', 2)).toBe('1,250,000.50');
    expect(formatDecimalForDisplay('1250000', 'en-GB', 2)).toBe('1,250,000');
  });
});

function Harness({ currency, onValue }: { currency: string; onValue: (v: string) => void }) {
  const [value, setValue] = useState('');
  return <MoneyInput id="rent" label="Rent" currency={currency} value={value} onChange={(v) => { setValue(v); onValue(v); }} />;
}

describe('MoneyInput', () => {
  it('round-trips "1250000.50" exactly and shows it grouped once the field loses focus', async () => {
    const values: string[] = [];
    renderWithProviders(<><Harness currency="KES" onValue={(v) => values.push(v)} /><button type="button">elsewhere</button></>);
    const input = screen.getByRole('textbox', { name: /rent/i });
    await userEvent.type(input, '1250000.50');
    expect(values.at(-1)).toBe('1250000.50');
    expect(input).toHaveValue('1250000.50');
    await userEvent.click(screen.getByRole('button', { name: 'elsewhere' }));
    expect(input).toHaveValue('1,250,000.50');
    expect(screen.getByText('KES')).toBeInTheDocument();
  });

  it('refuses decimals for a currency without a minor unit', async () => {
    const values: string[] = [];
    renderWithProviders(<Harness currency="UGX" onValue={(v) => values.push(v)} />);
    await userEvent.type(screen.getByRole('textbox', { name: /rent/i }), '4500000.75');
    expect(values.at(-1)).toBe('4500000');
  });
});
