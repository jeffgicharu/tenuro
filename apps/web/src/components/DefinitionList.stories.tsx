import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { DefinitionList, SectionHeading } from './DefinitionList.tsx';

// Terms come from the app's catalogues; the values are a lease's details written in each language,
// as the app shows them (an Arabic-speaking company's records are in Arabic).
const VALUES: Record<'en' | 'ar' | 'sw', string[]> = {
  en: ['Wanyika Estates Limited', 'Level 4, Wing B', '5 years from 1 March 2024', 'Quarterly in advance', 'Every 2 years to open market rent', 'Tenant only, 1 March 2027 on 6 months’ notice'],
  ar: ['شركة الواحة العقارية', 'الطابق 4، الجناح ب', '5 سنوات اعتباراً من 1 مارس 2024', 'كل ربع سنة مقدماً', 'كل سنتين إلى إيجار السوق', 'للمستأجر فقط، 1 مارس 2027 بإشعار 6 أشهر'],
  sw: ['Wanyika Estates Limited', 'Ghorofa ya 4, Bawa B', 'Miaka 5 kuanzia 1 Machi 2024', 'Kila robo mwaka, mapema', 'Kila miaka 2 kwa kodi ya soko', 'Mpangaji pekee, 1 Machi 2027 kwa notisi ya miezi 6'],
};
const TERMS = ['party.LANDLORD', 'lease.field.premises', 'lease.field.termMonths', 'lease.field.frequency', 'lease.field.escalation', 'option.BREAK'];

function Example({ columns }: { columns: 1 | 2 }) {
  const intl = useIntl();
  const lang = intl.locale.slice(0, 2) as keyof typeof VALUES;
  const values = VALUES[lang] ?? VALUES.en;
  return <DefinitionList columns={columns} items={TERMS.map((id, i) => ({ term: intl.formatMessage({ id }), value: values[i]! }))} />;
}

const meta = { title: 'Components/DefinitionList' } satisfies Meta;
export default meta;
function WithHeading() {
  return <><SectionHeading>{useIntl().formatMessage({ id: 'lease.section.term' })}</SectionHeading><Example columns={1} /></>;
}
export const OneColumn: StoryObj = { render: () => <WithHeading /> };
export const TwoColumns: StoryObj = { render: () => <Example columns={2} /> };
