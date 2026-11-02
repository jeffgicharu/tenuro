import type { Key } from './messages.ts';

export const reportsSw: Record<Key, string> = {
  'reports.title': 'Ripoti',
  'reports.lede': 'Zinaandaliwa kutoka data hai unapoziomba, kama CSV au faili la Excel',
  'reports.register.title': 'Rejista ya mikataba', 'reports.register.description': 'Kila mkataba hai pamoja na jengo, mwenye nyumba, muda, kodi na tarehe muhimu inayofuata.', 'reports.register.file': 'lease-register',
  'reports.rentRoll.title': 'Orodha ya kodi', 'reports.rentRoll.description': 'Kodi inayolipwa kwa kila mkataba, kwa kipindi na kwa mwaka, pamoja na kodi kwa m² na muhtasari kwa sarafu.', 'reports.rentRoll.file': 'rent-roll',
  'reports.expiries.title': 'Ratiba ya mwisho wa mikataba', 'reports.expiries.description': 'Mikataba inayoisha ndani ya miaka miwili ijayo, iliyo karibu kwanza, na kodi iliyo hatarini.', 'reports.expiries.file': 'expiry-schedule',
  'reports.keyDates.title': 'Tarehe muhimu, siku 90 zijazo', 'reports.keyDates.description': 'Notisi, mapitio, mwisho wa mikataba na marejesho yaliyo wazi pamoja na wahusika na vikumbusho.', 'reports.keyDates.file': 'key-dates-90-days',
  'reports.accounting.title': 'Uhasibu wa ukodishaji', 'reports.accounting.description': 'Dhima (ya muda mfupi na mrefu), mali za haki ya matumizi, gharama za mwaka huu na ukomavu wa malipo.', 'reports.accounting.file': 'lease-accounting',
  'reports.locations.title': 'Kodi kwa eneo', 'reports.locations.description': 'Kodi inayolipwa na idadi ya mikataba kwa mji na kwa nchi.', 'reports.locations.file': 'rent-by-location',
  'reports.sheet.about': 'Kuhusu', 'reports.sheet.byCurrency': 'Kwa sarafu', 'reports.sheet.maturity': 'Ukomavu', 'reports.sheet.byCountry': 'Kwa nchi',
  'reports.about.generated': 'Imeandaliwa', 'reports.about.rows': 'Safu', 'reports.about.source': 'Chanzo',
  'reports.progress': 'Inakusanya {done, number} kati ya {total, number}…', 'reports.preparing': 'Inaandaa…',
  'reports.ready': '{title} imepakuliwa.',
};
