import type { Key } from './messages.ts';

export const reportsAr: Record<Key, string> = {
  'reports.title': 'التقارير',
  'reports.lede': 'تُعدّ من البيانات الحية عند طلبها، بصيغة CSV أو ملف Excel',
  'reports.register.title': 'سجل العقود', 'reports.register.description': 'كل العقود السارية مع العقار والمؤجر والمدة والإيجار والموعد المهم التالي.', 'reports.register.file': 'lease-register',
  'reports.rentRoll.title': 'كشف الإيجارات', 'reports.rentRoll.description': 'الإيجار الساري لكل عقد للفترة وللسنة، مع الإيجار لكل متر مربع وملخص حسب العملة.', 'reports.rentRoll.file': 'rent-roll',
  'reports.expiries.title': 'جدول انتهاء العقود', 'reports.expiries.description': 'العقود المنتهية خلال السنتين القادمتين، الأقرب أولاً، مع الإيجار المعرّض.', 'reports.expiries.file': 'expiry-schedule',
  'reports.keyDates.title': 'المواعيد المهمة خلال 90 يوماً', 'reports.keyDates.description': 'الإشعارات والمراجعات والانتهاءات والاستردادات المفتوحة مع المسؤولين والتذكيرات.', 'reports.keyDates.file': 'key-dates-90-days',
  'reports.accounting.title': 'محاسبة عقود الإيجار', 'reports.accounting.description': 'الالتزامات (المتداولة وغير المتداولة) وأصول حق الاستخدام ومصروفات السنة واستحقاق الدفعات.', 'reports.accounting.file': 'lease-accounting',
  'reports.locations.title': 'الإيجار حسب الموقع', 'reports.locations.description': 'الإيجار الساري وعدد العقود حسب المدينة والدولة.', 'reports.locations.file': 'rent-by-location',
  'reports.sheet.about': 'حول التقرير', 'reports.sheet.byCurrency': 'حسب العملة', 'reports.sheet.maturity': 'الاستحقاق', 'reports.sheet.byCountry': 'حسب الدولة',
  'reports.about.generated': 'أُعدّ في', 'reports.about.rows': 'الصفوف', 'reports.about.source': 'المصدر',
  'reports.progress': 'جارٍ جمع {done, number} من {total, number}…', 'reports.preparing': 'جارٍ الإعداد…',
  'reports.ready': 'نُزّل {title}.',
};
