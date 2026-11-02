// Name parts for the seed data. Building and landlord names combine coined roots with
// ordinary words, so no name is meant to match a real company or building.
// People's names are common first names and surnames paired at random; they describe no one.

export const EA_ROOTS = [
  'Nyakoro', 'Olesira', 'Kiyanzi', 'Ruhoro', 'Ngarisa', 'Simbiro', 'Lakeri', 'Mbereni', 'Oloreti', 'Nyandiko',
  'Kaberewa', 'Twerimo', 'Murenge', 'Kindaro', 'Omwega', 'Rubiri', 'Kisavo', 'Malindio', 'Seruyo', 'Ndovuni',
  'Kanyoni', 'Tulimbe', 'Olmeraki', 'Wanyika', 'Gatundi', 'Rwamiro', 'Kibwezo', 'Namaleri', 'Busoro', 'Kesingo',
];
export const EA_BUILDINGS = ['House', 'Plaza', 'Towers', 'Business Park', 'Court', 'Centre', 'Square', 'Office Park'];
export const EA_LOGISTICS = ['Logistics Park', 'Industrial Park', 'Godowns', 'Distribution Centre', 'Business Hub'];
export const EA_LANDLORD_NOUNS = ['Properties', 'Investments', 'Estates', 'Holdings', 'Realty', 'Developers'];

export const GULF_ROOTS = [
  'نويرة', 'برقاء', 'رمثة', 'سهلة', 'قصرين', 'ثمرة', 'حيال', 'مزرعة', 'عوينة', 'شوقة',
  'ريفان', 'طلحاء', 'ظلال', 'جرعة', 'سمحان', 'بيدان', 'وسمى', 'رقيعة', 'غضاة', 'نخيلة',
];
export const GULF_BUILDINGS = ['برج', 'مجمع', 'مركز', 'بلازا', 'أبراج', 'واحة'];
export const GULF_LOGISTICS = ['مستودعات', 'مجمع لوجستي', 'منطقة مستودعات', 'مركز توزيع'];
export const GULF_LANDLORD_PREFIX = ['شركة', 'مؤسسة', 'مجموعة'];
export const GULF_LANDLORD_NOUNS = ['للاستثمار العقاري', 'العقارية', 'للتطوير العقاري', 'القابضة'];

export const EU_ROOTS = [
  'Corvell', 'Ashwyn', 'Merrowby', 'Tallisford', 'Brennick', 'Oskerby', 'Vandrecht', 'Lindqvarn', 'Kesselhorn', 'Lindwerth',
  'Overkamp', 'Beaumarel', 'Valcourtin', 'Sarrelune', 'Haverleigh', 'Drummore', 'Penvarrow', 'Eskwith', 'Fenhallow', 'Morvane',
  'Altenbrück', 'Zuiderveld', 'Grevelinck', 'Chantebrise', 'Roselière', 'Wexcombe', 'Holmbrand', 'Strathmere', 'Ellerwick', 'Quarrendon',
];
export const EU_BUILDINGS: Record<string, string[]> = {
  GB: ['House', 'Court', 'Exchange', 'Works', 'Yard', 'Chambers'],
  NL: ['Huis', 'Toren', 'Kade', 'Hof', 'Poort'],
  DE: ['Haus', 'Hof', 'Forum', 'Tor', 'Quartier'],
  FR: ['Tour', 'Carré', 'Cour', 'Espace', 'Atrium'],
};
export const EU_LOGISTICS: Record<string, string[]> = {
  GB: ['Distribution Park', 'Trade Park', 'Industrial Estate'],
  NL: ['Logistiek Park', 'Distributiecentrum', 'Bedrijvenpark'],
  DE: ['Logistikpark', 'Gewerbepark', 'Logistikzentrum'],
  FR: ['Parc Logistique', "Parc d'Activités", 'Plateforme'],
};
export const EU_LANDLORD_NOUNS: Record<string, string[]> = {
  GB: ['Estates', 'Properties', 'Investments', 'Land'],
  NL: ['Vastgoed', 'Beleggingen', 'Onroerend Goed'],
  DE: ['Immobilien', 'Grundbesitz', 'Liegenschaften'],
  FR: ['Immobilier', 'Patrimoine', 'Foncière'],
};

export const STREET_PATTERNS: Record<string, (root: string, n: number) => string> = {
  KE: (r, n) => `${r} Road, off ${['Waiyaki Way', 'Ngong Road', 'Mombasa Road', 'Thika Road', 'Lang’ata Road'][n % 5]}`,
  UG: (r, n) => `Plot ${12 + (n % 140)}, ${r} Road`,
  TZ: (r, n) => `Plot ${3 + (n % 300)}, ${r} Street`,
  RW: (r, n) => `KG ${100 + (n % 700)} St, ${r}`,
  AE: (r, n) => `شارع ${r}، مبنى ${10 + (n % 90)}`,
  SA: (r, n) => `طريق ${r}، رقم ${1000 + (n % 8000)}`,
  BH: (r, n) => `مجمع ${300 + (n % 600)}، طريق ${r}`,
  OM: (r, n) => `سكة ${r}، مبنى ${100 + (n % 800)}`,
  GB: (r, n) => `${10 + (n % 180)} ${r} ${['Street', 'Lane', 'Road', 'Place'][n % 4]}`,
  NL: (r, n) => `${r}straat ${1 + (n % 220)}`,
  DE: (r, n) => `${r}straße ${1 + (n % 160)}`,
  FR: (r, n) => `${1 + (n % 120)} rue ${r}`,
};

export const PEOPLE = {
  EA: {
    first: ['Wanjiru', 'Otieno', 'Achieng', 'Kamau', 'Njeri', 'Mutua', 'Akinyi', 'Kiprono', 'Nasimiyu', 'Baraka', 'Amani', 'Neema',
      'Juma', 'Halima', 'Brian', 'Faith', 'Kevin', 'Mercy', 'Dennis', 'Grace', 'Joseph', 'Lilian', 'Aisha', 'Rehema', 'Moses', 'Esther',
      'Nakato', 'Mugisha', 'Uwase', 'Habimana', 'Iradukunda', 'Daudi', 'Zawadi', 'Imani'],
    last: ['Mwangi', 'Ochieng', 'Kariuki', 'Wekesa', 'Njoroge', 'Chebet', 'Odhiambo', 'Mutiso', 'Ssemanda', 'Namutebi', 'Okello', 'Mushi',
      'Massawe', 'Mollel', 'Swai', 'Kimaro', 'Mukamana', 'Niyonzima', 'Uwimana', 'Wairimu', 'Kiplagat', 'Atuhaire', 'Nyirenda', 'Lyimo'],
  },
  GULF: {
    first: ['محمد', 'فاطمة', 'أحمد', 'مريم', 'خالد', 'نورة', 'سعيد', 'ريم', 'عبدالله', 'هند', 'يوسف', 'سارة', 'عمر', 'لطيفة',
      'راشد', 'أمل', 'سلطان', 'دانة', 'حمد', 'شيخة', 'منصور', 'العنود'],
    last: ['الحارثي', 'المري', 'الزعابي', 'القحطاني', 'العتيبي', 'الشمري', 'البلوشي', 'الكعبي', 'الدوسري', 'الهاشمي', 'النعيمي',
      'الفلاسي', 'المناعي', 'الجابري', 'السيابي', 'الغامدي'],
  },
  EU: {
    first: ['Oliver', 'Charlotte', 'Hannah', 'Lukas', 'Sophie', 'Thomas', 'Emma', 'Daan', 'Lotte', 'Julien', 'Camille', 'Felix', 'Anna',
      'Mateo', 'Chloé', 'Pieter', 'Isabel', 'Max', 'Léa', 'James', 'Priya', 'Tomasz', 'Ingrid', 'Rafael'],
    last: ['Whitfield', 'Achterberg', 'Brandt', 'Moreau', 'Hollis', 'Van Dijk', 'Schreiber', 'Lefèvre', 'Okafor', 'Kowalski', 'Nyberg',
      'Fairbairn', 'Dubois', 'Hartmann', 'Visser', 'Pemberton', 'Reinholt', 'Marchetti', 'Sandoval', 'Ashworth'],
  },
} as const;

export const PREMISES: Record<string, (n: number, type: string) => string> = {
  en: (n, type) => {
    if (type === 'WAREHOUSE' || type === 'INDUSTRIAL') return `Unit ${1 + (n % 24)}`;
    if (type === 'RETAIL') return `Shop ${['G', '1', 'LG'][n % 3]}-${String(1 + (n % 40)).padStart(2, '0')}`;
    return `Level ${1 + (n % 18)}, ${['North', 'South', 'East', 'West', 'Wing A', 'Wing B', 'Whole floor'][n % 7]}`;
  },
  ar: (n, type) => {
    if (type === 'WAREHOUSE' || type === 'INDUSTRIAL') return `وحدة ${1 + (n % 24)}`;
    if (type === 'RETAIL') return `محل ${1 + (n % 60)}، الطابق ${['الأرضي', 'الأول', 'الثاني'][n % 3]}`;
    return `الطابق ${1 + (n % 30)}، ${['الجناح الشمالي', 'الجناح الجنوبي', 'الطابق كاملاً', 'مكتب ' + (100 + (n % 40))][n % 4]}`;
  },
};
