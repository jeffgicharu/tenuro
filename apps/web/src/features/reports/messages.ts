export const reportsEn = {
  'reports.title': 'Reports',
  'reports.lede': 'Built from live data when you ask for them, as CSV or an Excel workbook',
  'reports.register.title': 'Lease register', 'reports.register.description': 'Every live lease with its property, landlord, term, rent and next key date.', 'reports.register.file': 'lease-register',
  'reports.rentRoll.title': 'Rent roll', 'reports.rentRoll.description': 'Passing rent by lease, per period and a year, with rent per m² and a summary by currency.', 'reports.rentRoll.file': 'rent-roll',
  'reports.expiries.title': 'Expiry schedule', 'reports.expiries.description': 'Leases ending in the next two years, soonest first, with the rent at stake.', 'reports.expiries.file': 'expiry-schedule',
  'reports.keyDates.title': 'Key dates, next 90 days', 'reports.keyDates.description': 'Open notices, reviews, expiries and returns with their owners and reminders.', 'reports.keyDates.file': 'key-dates-90-days',
  'reports.accounting.title': 'Lease accounting', 'reports.accounting.description': 'Liability (current and non-current), right-of-use assets, this year’s charges and the maturity of payments.', 'reports.accounting.file': 'lease-accounting',
  'reports.locations.title': 'Rent by location', 'reports.locations.description': 'Passing rent and lease counts by city and by country.', 'reports.locations.file': 'rent-by-location',
  'reports.sheet.about': 'About', 'reports.sheet.byCurrency': 'By currency', 'reports.sheet.maturity': 'Maturity', 'reports.sheet.byCountry': 'By country',
  'reports.about.generated': 'Generated', 'reports.about.rows': 'Rows', 'reports.about.source': 'Source',
  'reports.progress': 'Gathering {done, number} of {total, number}…', 'reports.preparing': 'Preparing…',
  'reports.ready': '{title} downloaded.',
};

export type Key = keyof typeof reportsEn;
