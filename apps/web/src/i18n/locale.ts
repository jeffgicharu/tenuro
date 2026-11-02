export type Language = 'en' | 'ar' | 'sw';

export const LANGUAGES: Record<Language, { label: string; dir: 'ltr' | 'rtl' }> = {
  en: { label: 'English', dir: 'ltr' },
  ar: { label: 'العربية', dir: 'rtl' },
  sw: { label: 'Kiswahili', dir: 'ltr' },
};

// Combines the interface language with the company's region, so an English-speaking user at a
// Kenyan company sees en-KE formats and an Arabic speaker at a Gulf company sees ar-AE.
export function intlLocale(language: Language, tenantLocale: string): string {
  const region = tenantLocale.split('-')[1];
  if (language === 'en') return region ? `en-${region}` : 'en-GB';
  if (language === 'ar') return region && ['AE', 'SA', 'BH', 'OM', 'QA', 'KW'].includes(region) ? `ar-${region}` : 'ar-AE';
  return region && ['KE', 'TZ', 'UG'].includes(region) ? `sw-${region}` : 'sw-KE';
}

export function isLanguage(v: unknown): v is Language {
  return v === 'en' || v === 'ar' || v === 'sw';
}
