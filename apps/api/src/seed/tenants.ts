import type { TenantTheme, UserRole } from '../db/types.ts';
import { EAST_AFRICA, EUROPE, GULF, type Market } from './markets.ts';

export interface TenantSeed {
  slug: string;
  name: string;
  nameLocal: string | null;
  locale: string;
  languages: string[];
  reportingCurrency: string;
  theme: TenantTheme;
  markets: Market[];
  region: 'EA' | 'GULF' | 'EU';
  leases: number;
  emailDomain: string;
  signInAccounts: { role: UserRole; name: string; title: string }[];
  staffTitles: string[];
}

// Domains use the reserved .example TLD, so no address can reach a real mailbox.
export const TENANTS: TenantSeed[] = [
  {
    slug: 'mbuyu-court',
    name: 'Mbuyu Court Holdings',
    nameLocal: null,
    locale: 'en-KE',
    languages: ['en', 'sw'],
    reportingCurrency: 'KES',
    theme: {
      brandHue: 138, accentHue: 70, density: 'compact',
      logo: '/static/logos/mbuyu-court/lockup.svg', logoOnDark: '/static/logos/mbuyu-court/lockup-on-dark.svg',
      mark: '/static/logos/mbuyu-court/mark.svg',
    },
    markets: EAST_AFRICA,
    region: 'EA',
    leases: 10_000,
    emailDomain: 'mbuyucourt.example',
    signInAccounts: [
      { role: 'ADMIN', name: 'Wanjiru Kariuki', title: 'Head of Property' },
      { role: 'MANAGER', name: 'Otieno Wekesa', title: 'Lease Manager' },
      { role: 'VIEWER', name: 'Nasimiyu Chebet', title: 'Finance Analyst' },
    ],
    staffTitles: ['Lease Manager', 'Lease Manager', 'Senior Lease Manager', 'Property Accountant', 'Portfolio Analyst', 'Facilities Coordinator'],
  },
  {
    slug: 'sunbula',
    name: 'Sunbula Estates',
    nameLocal: 'السنبلة العقارية',
    locale: 'ar-AE',
    languages: ['ar', 'en'],
    reportingCurrency: 'AED',
    theme: {
      brandHue: 200, accentHue: 82, density: 'comfortable',
      logo: '/static/logos/sunbula/lockup.svg', logoOnDark: '/static/logos/sunbula/lockup-on-dark.svg',
      mark: '/static/logos/sunbula/mark.svg',
    },
    markets: GULF,
    region: 'GULF',
    leases: 2_000,
    emailDomain: 'sunbula.example',
    signInAccounts: [
      { role: 'ADMIN', name: 'ريم الكعبي', title: 'مديرة المحفظة العقارية' },
      { role: 'MANAGER', name: 'خالد الهاشمي', title: 'مدير عقود الإيجار' },
      { role: 'VIEWER', name: 'سارة المناعي', title: 'محللة مالية' },
    ],
    staffTitles: ['مدير عقود الإيجار', 'مدير عقود الإيجار', 'محاسب عقاري', 'محلل محفظة', 'منسق مرافق'],
  },
  {
    slug: 'halvard-crane',
    name: 'Halvard & Crane Property Partners',
    nameLocal: null,
    locale: 'en-GB',
    languages: ['en'],
    reportingCurrency: 'GBP',
    theme: {
      brandHue: 258, accentHue: 78, density: 'standard',
      logo: '/static/logos/halvard-crane/lockup.svg', logoOnDark: '/static/logos/halvard-crane/lockup-on-dark.svg',
      mark: '/static/logos/halvard-crane/mark.svg',
    },
    markets: EUROPE,
    region: 'EU',
    leases: 1_200,
    emailDomain: 'halvardcrane.example',
    signInAccounts: [
      { role: 'ADMIN', name: 'Charlotte Pemberton', title: 'Partner, Real Estate' },
      { role: 'MANAGER', name: 'Lukas Hartmann', title: 'Lease Manager' },
      { role: 'VIEWER', name: 'Camille Dubois', title: 'Financial Controller' },
    ],
    staffTitles: ['Lease Manager', 'Asset Manager', 'Property Accountant', 'Portfolio Analyst', 'Building Surveyor'],
  },
];
