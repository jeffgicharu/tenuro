import type { EscalationKind, PaymentFrequency, PaymentTiming, PropertyType } from '../db/types.ts';

// Market shapes for the seed data. Rents are per square metre per month in the lease currency.

export interface District {
  name: string;
  lat: number;
  lng: number;
  types: PropertyType[];
}

export interface City {
  name: string;
  weight: number;
  factor: number;
  districts: District[];
}

export interface Market {
  country: string;
  weight: number;
  currencies: readonly (readonly [string, number])[];
  rent: Record<PropertyType, [number, number]>;
  usdRent?: Record<PropertyType, [number, number]>;
  ibr: Record<string, [number, number]>;
  frequency: readonly (readonly [PaymentFrequency, number])[];
  timing: PaymentTiming;
  escalation: readonly (readonly [EscalationKind | 'NONE', number])[];
  fixedRate: [number, number];
  reviewEveryMonths: number;
  termYears: Record<PropertyType, readonly number[]>;
  depositMonths: number;
  lesseeEntity: string;
  landlordSuffix: string;
  cities: City[];
}

const d = (name: string, lat: number, lng: number, types: PropertyType[]): District => ({ name, lat, lng, types });
const OFFICE_RETAIL: PropertyType[] = ['OFFICE', 'RETAIL', 'MIXED_USE'];
const LOGISTICS: PropertyType[] = ['WAREHOUSE', 'INDUSTRIAL'];
const ALL: PropertyType[] = ['OFFICE', 'RETAIL', 'MIXED_USE', 'WAREHOUSE', 'INDUSTRIAL'];

export const EAST_AFRICA: Market[] = [
  {
    country: 'KE', weight: 55,
    currencies: [['KES', 70], ['USD', 30]],
    rent: { OFFICE: [950, 1500], RETAIL: [1400, 3600], MIXED_USE: [900, 1600], WAREHOUSE: [480, 720], INDUSTRIAL: [380, 560] },
    usdRent: { OFFICE: [9, 14], RETAIL: [12, 28], MIXED_USE: [8, 13], WAREHOUSE: [4, 6], INDUSTRIAL: [3, 4.5] },
    ibr: { KES: [0.128, 0.152], USD: [0.072, 0.084] },
    frequency: [['QUARTERLY', 70], ['MONTHLY', 30]], timing: 'ADVANCE',
    escalation: [['FIXED', 85], ['NONE', 10], ['MARKET_REVIEW', 5]], fixedRate: [0.05, 0.075], reviewEveryMonths: 12,
    termYears: { OFFICE: [6, 6, 5, 9, 10], RETAIL: [6, 5, 10], MIXED_USE: [6, 5], WAREHOUSE: [10, 6, 15], INDUSTRIAL: [10, 15, 6] },
    depositMonths: 3, lesseeEntity: 'Mbuyu Court Holdings (Kenya) Limited', landlordSuffix: 'Limited',
    cities: [
      { name: 'Nairobi', weight: 70, factor: 1, districts: [
        d('Westlands', -1.2648, 36.8066, OFFICE_RETAIL), d('Upper Hill', -1.2985, 36.8156, ['OFFICE']),
        d('Kilimani', -1.2906, 36.7837, OFFICE_RETAIL), d('Gigiri', -1.2337, 36.8053, ['OFFICE']),
        d('Parklands', -1.2615, 36.8176, OFFICE_RETAIL), d('Karen', -1.3197, 36.7073, ['RETAIL', 'OFFICE']),
        d('Industrial Area', -1.3063, 36.8517, LOGISTICS), d('Mombasa Road', -1.3315, 36.8790, LOGISTICS),
        d('Ruaraka', -1.2440, 36.8790, LOGISTICS) ] },
      { name: 'Mombasa', weight: 14, factor: 0.82, districts: [
        d('Nyali', -4.0435, 39.7120, OFFICE_RETAIL), d('Changamwe', -4.0270, 39.6300, LOGISTICS), d('Port Reitz', -4.0425, 39.6110, LOGISTICS) ] },
      { name: 'Kisumu', weight: 6, factor: 0.7, districts: [d('Milimani', -0.1045, 34.7540, OFFICE_RETAIL), d('Kibos Road', -0.0805, 34.7720, LOGISTICS)] },
      { name: 'Nakuru', weight: 5, factor: 0.68, districts: [d('Milimani', -0.2950, 36.0700, OFFICE_RETAIL), d('Lanet', -0.3000, 36.1300, LOGISTICS)] },
      { name: 'Ruiru', weight: 5, factor: 0.75, districts: [d('Tatu City', -1.1530, 36.9300, ALL), d('Kamiti Road', -1.1650, 36.9500, LOGISTICS)] },
    ],
  },
  {
    country: 'UG', weight: 18,
    currencies: [['USD', 60], ['UGX', 40]],
    rent: { OFFICE: [42000, 58000], RETAIL: [55000, 110000], MIXED_USE: [38000, 52000], WAREHOUSE: [16000, 24000], INDUSTRIAL: [13000, 19000] },
    usdRent: { OFFICE: [11, 16], RETAIL: [14, 30], MIXED_USE: [10, 14], WAREHOUSE: [4.5, 6.5], INDUSTRIAL: [3.5, 5] },
    ibr: { UGX: [0.158, 0.182], USD: [0.075, 0.088] },
    frequency: [['QUARTERLY', 60], ['MONTHLY', 25], ['ANNUAL', 15]], timing: 'ADVANCE',
    escalation: [['FIXED', 80], ['NONE', 20]], fixedRate: [0.03, 0.05], reviewEveryMonths: 12,
    termYears: { OFFICE: [5, 3, 6], RETAIL: [5, 3], MIXED_USE: [5], WAREHOUSE: [10, 5], INDUSTRIAL: [10, 5] },
    depositMonths: 3, lesseeEntity: 'Mbuyu Court Holdings (Uganda) Limited', landlordSuffix: 'Limited',
    cities: [
      { name: 'Kampala', weight: 80, factor: 1, districts: [
        d('Nakasero', 0.3240, 32.5800, ['OFFICE']), d('Kololo', 0.3330, 32.5930, OFFICE_RETAIL),
        d('Bugolobi', 0.3200, 32.6150, ALL), d('Ntinda', 0.3530, 32.6150, OFFICE_RETAIL), d('Industrial Area', 0.3150, 32.6000, LOGISTICS) ] },
      { name: 'Entebbe', weight: 10, factor: 0.8, districts: [d('Kitooro', 0.0560, 32.4790, OFFICE_RETAIL)] },
      { name: 'Mukono', weight: 10, factor: 0.7, districts: [d('Namanve', 0.3550, 32.6900, LOGISTICS)] },
    ],
  },
  {
    country: 'TZ', weight: 17,
    currencies: [['USD', 65], ['TZS', 35]],
    rent: { OFFICE: [33000, 45000], RETAIL: [42000, 90000], MIXED_USE: [30000, 40000], WAREHOUSE: [14000, 21000], INDUSTRIAL: [11000, 17000] },
    usdRent: { OFFICE: [13, 18], RETAIL: [15, 32], MIXED_USE: [11, 15], WAREHOUSE: [5, 7.5], INDUSTRIAL: [4, 6] },
    ibr: { TZS: [0.142, 0.165], USD: [0.074, 0.086] },
    frequency: [['QUARTERLY', 55], ['ANNUAL', 25], ['MONTHLY', 20]], timing: 'ADVANCE',
    escalation: [['FIXED', 85], ['NONE', 15]], fixedRate: [0.03, 0.05], reviewEveryMonths: 12,
    termYears: { OFFICE: [5, 3, 6], RETAIL: [5, 3], MIXED_USE: [5], WAREHOUSE: [10, 5], INDUSTRIAL: [10, 5] },
    depositMonths: 3, lesseeEntity: 'Mbuyu Court Holdings (Tanzania) Limited', landlordSuffix: 'Limited',
    cities: [
      { name: 'Dar es Salaam', weight: 80, factor: 1, districts: [
        d('Masaki', -6.7470, 39.2780, OFFICE_RETAIL), d('Oyster Bay', -6.7650, 39.2830, ['OFFICE']),
        d('Upanga', -6.8080, 39.2860, OFFICE_RETAIL), d('Mikocheni', -6.7600, 39.2470, ALL), d('Kurasini', -6.8500, 39.2850, LOGISTICS) ] },
      { name: 'Arusha', weight: 12, factor: 0.78, districts: [d('Njiro', -3.3920, 36.7000, OFFICE_RETAIL)] },
      { name: 'Mwanza', weight: 8, factor: 0.72, districts: [d('Capri Point', -2.5300, 32.9000, ALL)] },
    ],
  },
  {
    country: 'RW', weight: 10,
    currencies: [['USD', 60], ['RWF', 40]],
    rent: { OFFICE: [17000, 24000], RETAIL: [22000, 42000], MIXED_USE: [15000, 21000], WAREHOUSE: [6500, 9500], INDUSTRIAL: [5500, 8000] },
    usdRent: { OFFICE: [13, 18], RETAIL: [16, 30], MIXED_USE: [11, 15], WAREHOUSE: [5, 7], INDUSTRIAL: [4, 6] },
    ibr: { RWF: [0.148, 0.168], USD: [0.074, 0.086] },
    frequency: [['QUARTERLY', 60], ['MONTHLY', 40]], timing: 'ADVANCE',
    escalation: [['FIXED', 85], ['NONE', 15]], fixedRate: [0.03, 0.05], reviewEveryMonths: 12,
    termYears: { OFFICE: [5, 3], RETAIL: [5, 3], MIXED_USE: [5], WAREHOUSE: [10, 5], INDUSTRIAL: [10] },
    depositMonths: 3, lesseeEntity: 'Mbuyu Court Holdings (Rwanda) Ltd', landlordSuffix: 'Ltd',
    cities: [
      { name: 'Kigali', weight: 100, factor: 1, districts: [
        d('Kacyiru', -1.9440, 30.0880, ['OFFICE']), d('Kimihurura', -1.9530, 30.0950, OFFICE_RETAIL),
        d('Nyarutarama', -1.9370, 30.1080, OFFICE_RETAIL), d('Kicukiro', -1.9800, 30.1050, ALL), d('Masoro', -1.9300, 30.1650, LOGISTICS) ] },
    ],
  },
];

export const GULF: Market[] = [
  {
    country: 'AE', weight: 50, currencies: [['AED', 100]],
    rent: { OFFICE: [110, 210], RETAIL: [220, 420], MIXED_USE: [100, 170], WAREHOUSE: [34, 56], INDUSTRIAL: [28, 44] },
    ibr: { AED: [0.055, 0.067] },
    frequency: [['QUARTERLY', 45], ['ANNUAL', 35], ['MONTHLY', 20]], timing: 'ADVANCE',
    escalation: [['NONE', 45], ['FIXED', 55]], fixedRate: [0.03, 0.05], reviewEveryMonths: 24,
    termYears: { OFFICE: [3, 5, 3], RETAIL: [5, 3, 7], MIXED_USE: [3, 5], WAREHOUSE: [5, 10], INDUSTRIAL: [5, 10] },
    depositMonths: 1, lesseeEntity: 'السنبلة العقارية (الإمارات) ذ.م.م', landlordSuffix: 'ذ.م.م',
    cities: [
      { name: 'دبي', weight: 55, factor: 1, districts: [
        d('الخليج التجاري', 25.1857, 55.2750, OFFICE_RETAIL), d('أبراج بحيرات جميرا', 25.0760, 55.1440, OFFICE_RETAIL),
        d('القوز', 25.1350, 55.2300, LOGISTICS), d('جبل علي', 25.0100, 55.0900, LOGISTICS), d('دبي الجنوب', 24.8960, 55.1610, LOGISTICS) ] },
      { name: 'أبوظبي', weight: 30, factor: 0.9, districts: [
        d('جزيرة المارية', 24.5000, 54.3900, ['OFFICE']), d('الخالدية', 24.4700, 54.3500, OFFICE_RETAIL), d('مصفح', 24.3600, 54.4900, LOGISTICS) ] },
      { name: 'الشارقة', weight: 15, factor: 0.65, districts: [d('المجاز', 25.3250, 55.3900, OFFICE_RETAIL), d('الصجعة', 25.3300, 55.6300, LOGISTICS)] },
    ],
  },
  {
    country: 'SA', weight: 35, currencies: [['SAR', 100]],
    rent: { OFFICE: [95, 175], RETAIL: [180, 360], MIXED_USE: [90, 150], WAREHOUSE: [20, 36], INDUSTRIAL: [16, 28] },
    ibr: { SAR: [0.056, 0.068] },
    frequency: [['ANNUAL', 50], ['QUARTERLY', 35], ['MONTHLY', 15]], timing: 'ADVANCE',
    escalation: [['FIXED', 60], ['NONE', 40]], fixedRate: [0.03, 0.05], reviewEveryMonths: 36,
    termYears: { OFFICE: [3, 5], RETAIL: [5, 3], MIXED_USE: [5], WAREHOUSE: [5, 10], INDUSTRIAL: [5, 10] },
    depositMonths: 1, lesseeEntity: 'شركة السنبلة العقارية المحدودة', landlordSuffix: 'المحدودة',
    cities: [
      { name: 'الرياض', weight: 60, factor: 1, districts: [
        d('العليا', 24.6950, 46.6850, OFFICE_RETAIL), d('طريق الملك فهد', 24.7300, 46.6600, ['OFFICE']), d('السلي', 24.6200, 46.8300, LOGISTICS) ] },
      { name: 'جدة', weight: 28, factor: 0.85, districts: [d('الروضة', 21.5650, 39.1550, OFFICE_RETAIL), d('الخمرة', 21.3700, 39.2000, LOGISTICS)] },
      { name: 'الدمام', weight: 12, factor: 0.75, districts: [d('الشاطئ', 26.4500, 50.1000, OFFICE_RETAIL), d('المدينة الصناعية الثانية', 26.3400, 50.1300, LOGISTICS)] },
    ],
  },
  {
    country: 'BH', weight: 8, currencies: [['BHD', 100]],
    rent: { OFFICE: [5.5, 8.5], RETAIL: [9, 16], MIXED_USE: [5, 7.5], WAREHOUSE: [1.5, 2.6], INDUSTRIAL: [1.2, 2] },
    ibr: { BHD: [0.064, 0.074] },
    frequency: [['MONTHLY', 60], ['QUARTERLY', 40]], timing: 'ADVANCE',
    escalation: [['NONE', 50], ['FIXED', 50]], fixedRate: [0.03, 0.05], reviewEveryMonths: 24,
    termYears: { OFFICE: [3, 5], RETAIL: [3, 5], MIXED_USE: [3], WAREHOUSE: [5], INDUSTRIAL: [5] },
    depositMonths: 1, lesseeEntity: 'السنبلة العقارية (البحرين) ذ.م.م', landlordSuffix: 'ذ.م.م',
    cities: [{ name: 'المنامة', weight: 100, factor: 1, districts: [
      d('السيف', 26.2350, 50.5350, OFFICE_RETAIL), d('المرفأ المالي', 26.2400, 50.5770, ['OFFICE']), d('سترة', 26.1500, 50.6200, LOGISTICS) ] }],
  },
  {
    country: 'OM', weight: 7, currencies: [['OMR', 100]],
    rent: { OFFICE: [4, 6.5], RETAIL: [7, 13], MIXED_USE: [3.8, 5.8], WAREHOUSE: [1.2, 2], INDUSTRIAL: [1, 1.7] },
    ibr: { OMR: [0.063, 0.074] },
    frequency: [['MONTHLY', 55], ['QUARTERLY', 45]], timing: 'ADVANCE',
    escalation: [['NONE', 50], ['FIXED', 50]], fixedRate: [0.03, 0.05], reviewEveryMonths: 24,
    termYears: { OFFICE: [3, 5], RETAIL: [3, 5], MIXED_USE: [3], WAREHOUSE: [5], INDUSTRIAL: [5] },
    depositMonths: 1, lesseeEntity: 'السنبلة العقارية (عُمان) ش.م.م', landlordSuffix: 'ش.م.م',
    cities: [{ name: 'مسقط', weight: 100, factor: 1, districts: [
      d('القرم', 23.6150, 58.4800, OFFICE_RETAIL), d('روي', 23.5950, 58.5450, OFFICE_RETAIL), d('الرسيل', 23.5550, 58.1950, LOGISTICS) ] }],
  },
];

export const EUROPE: Market[] = [
  {
    country: 'GB', weight: 40, currencies: [['GBP', 100]],
    rent: { OFFICE: [24, 52], RETAIL: [30, 85], MIXED_USE: [22, 40], WAREHOUSE: [9, 15], INDUSTRIAL: [8, 13] },
    ibr: { GBP: [0.054, 0.066] },
    frequency: [['QUARTERLY', 85], ['MONTHLY', 15]], timing: 'ADVANCE',
    escalation: [['MARKET_REVIEW', 80], ['FIXED', 10], ['CPI', 10]], fixedRate: [0.025, 0.035], reviewEveryMonths: 60,
    termYears: { OFFICE: [10, 5, 15], RETAIL: [10, 5], MIXED_USE: [10], WAREHOUSE: [10, 15], INDUSTRIAL: [10, 15] },
    depositMonths: 6, lesseeEntity: 'Halvard & Crane Property Partners LLP', landlordSuffix: 'Limited',
    cities: [
      { name: 'London', weight: 50, factor: 1.45, districts: [
        d('Farringdon', 51.5203, -0.1053, OFFICE_RETAIL), d('Shoreditch', 51.5265, -0.0800, OFFICE_RETAIL),
        d('Southwark', 51.5035, -0.0950, ['OFFICE']), d('Park Royal', 51.5290, -0.2700, LOGISTICS) ] },
      { name: 'Manchester', weight: 22, factor: 0.82, districts: [d('Spinningfields', 53.4800, -2.2530, ['OFFICE']), d('Trafford Park', 53.4650, -2.3250, LOGISTICS)] },
      { name: 'Birmingham', weight: 15, factor: 0.75, districts: [d('Colmore Row', 52.4820, -1.8990, OFFICE_RETAIL), d('Tyseley', 52.4570, -1.8350, LOGISTICS)] },
      { name: 'Leeds', weight: 13, factor: 0.7, districts: [d('South Bank', 53.7900, -1.5450, OFFICE_RETAIL), d('Cross Green', 53.7900, -1.5100, LOGISTICS)] },
    ],
  },
  {
    country: 'NL', weight: 22, currencies: [['EUR', 100]],
    rent: { OFFICE: [22, 48], RETAIL: [25, 70], MIXED_USE: [20, 34], WAREHOUSE: [5.5, 7.8], INDUSTRIAL: [5, 7] },
    ibr: { EUR: [0.041, 0.052] },
    frequency: [['QUARTERLY', 60], ['MONTHLY', 40]], timing: 'ADVANCE',
    escalation: [['CPI', 90], ['FIXED', 10]], fixedRate: [0.02, 0.03], reviewEveryMonths: 12,
    termYears: { OFFICE: [5, 10], RETAIL: [5, 10], MIXED_USE: [5], WAREHOUSE: [10, 5, 15], INDUSTRIAL: [10, 5] },
    depositMonths: 3, lesseeEntity: 'Halvard & Crane Nederland B.V.', landlordSuffix: 'B.V.',
    cities: [
      { name: 'Amsterdam', weight: 45, factor: 1.2, districts: [d('Zuidas', 52.3380, 4.8720, ['OFFICE']), d('Sloterdijk', 52.3890, 4.8380, ALL)] },
      { name: 'Rotterdam', weight: 30, factor: 0.9, districts: [d('Kop van Zuid', 51.9050, 4.4900, OFFICE_RETAIL), d('Waalhaven', 51.8870, 4.4300, LOGISTICS)] },
      { name: 'Venlo', weight: 25, factor: 0.85, districts: [d('Trade Port', 51.3800, 6.1700, LOGISTICS)] },
    ],
  },
  {
    country: 'DE', weight: 22, currencies: [['EUR', 100]],
    rent: { OFFICE: [24, 46], RETAIL: [28, 80], MIXED_USE: [20, 32], WAREHOUSE: [5.5, 8], INDUSTRIAL: [5, 7.2] },
    ibr: { EUR: [0.040, 0.051] },
    frequency: [['MONTHLY', 85], ['QUARTERLY', 15]], timing: 'ADVANCE',
    escalation: [['CPI', 90], ['FIXED', 10]], fixedRate: [0.02, 0.03], reviewEveryMonths: 12,
    termYears: { OFFICE: [5, 10], RETAIL: [10, 5], MIXED_USE: [5], WAREHOUSE: [10, 5], INDUSTRIAL: [10] },
    depositMonths: 3, lesseeEntity: 'Halvard & Crane Deutschland GmbH', landlordSuffix: 'GmbH',
    cities: [
      { name: 'Frankfurt am Main', weight: 35, factor: 1.15, districts: [d('Westend', 50.1190, 8.6650, ['OFFICE']), d('Fechenheim', 50.1250, 8.7650, LOGISTICS)] },
      { name: 'Berlin', weight: 35, factor: 1, districts: [d('Mitte', 52.5200, 13.4050, OFFICE_RETAIL), d('Adlershof', 52.4330, 13.5400, ALL)] },
      { name: 'Hamburg', weight: 30, factor: 1.05, districts: [d('HafenCity', 53.5410, 9.9980, OFFICE_RETAIL), d('Billbrook', 53.5300, 10.1000, LOGISTICS)] },
    ],
  },
  {
    country: 'FR', weight: 16, currencies: [['EUR', 100]],
    rent: { OFFICE: [26, 62], RETAIL: [30, 90], MIXED_USE: [22, 36], WAREHOUSE: [4.5, 6.8], INDUSTRIAL: [4, 6] },
    ibr: { EUR: [0.041, 0.052] },
    frequency: [['QUARTERLY', 90], ['MONTHLY', 10]], timing: 'ADVANCE',
    escalation: [['CPI', 95], ['FIXED', 5]], fixedRate: [0.02, 0.03], reviewEveryMonths: 12,
    termYears: { OFFICE: [9, 6], RETAIL: [9], MIXED_USE: [9], WAREHOUSE: [9, 12], INDUSTRIAL: [9] },
    depositMonths: 3, lesseeEntity: 'Halvard & Crane France SAS', landlordSuffix: 'SCI',
    cities: [
      { name: 'Paris', weight: 55, factor: 1.25, districts: [d('La Défense', 48.8920, 2.2380, ['OFFICE']), d('Saint-Ouen', 48.9120, 2.3330, OFFICE_RETAIL)] },
      { name: 'Lyon', weight: 30, factor: 0.8, districts: [d('Part-Dieu', 45.7600, 4.8590, OFFICE_RETAIL), d('Saint-Priest', 45.7000, 4.9400, LOGISTICS)] },
      { name: 'Lille', weight: 15, factor: 0.7, districts: [d('Euralille', 50.6370, 3.0750, OFFICE_RETAIL), d('Lesquin', 50.5900, 3.1100, LOGISTICS)] },
    ],
  },
];

export const MINOR_UNITS: Record<string, number> = {
  KES: 2, UGX: 0, TZS: 2, RWF: 0, USD: 2, AED: 2, SAR: 2, BHD: 3, OMR: 3, GBP: 2, EUR: 2,
};

// Units per USD, used to convert to the reporting currency.
export const PER_USD: Record<string, number> = {
  USD: 1, KES: 129.4, UGX: 3685, TZS: 2610, RWF: 1420, AED: 3.6725, SAR: 3.75, BHD: 0.376, OMR: 0.3845, GBP: 0.762, EUR: 0.872,
};
