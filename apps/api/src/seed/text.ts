import type { KeyDateKind } from '../db/types.ts';

// Free text in the seed records, written in each company's working language: an Arabic-speaking
// company's own lease records, tasks and history are in Arabic.
type Lang = 'en' | 'ar';

const TEXT = {
  en: {
    breakTerms: 'Tenant-only break on not less than six months’ written notice; vacant possession and rent paid to date.',
    renewTerms: (years: number) => `Option to renew for ${years} years at open market rent, on the same terms otherwise.`,
    keyDate: {
      EXPIRY: 'Lease expiry', BREAK_NOTICE: 'Break notice deadline', RENEWAL_NOTICE: 'Renewal notice deadline',
      RENT_REVIEW: 'Rent review', DEPOSIT_RETURN: 'Deposit return due', INSURANCE: 'Insurance certificate renewal', CUSTOM: 'Key date',
    } satisfies Record<KeyDateKind, string>,
    task: {
      EXPIRY: 'Decide on exit or renewal and brief the landlord',
      BREAK_NOTICE: 'Confirm break decision and serve notice if exercising',
      RENEWAL_NOTICE: 'Prepare renewal terms and serve notice',
      RENT_REVIEW_FIXED: 'Check uplifted rent on the next invoice',
      RENT_REVIEW: 'Agree the reviewed rent with the landlord',
      DEPOSIT_RETURN: 'Chase return of the deposit',
      INSURANCE: 'Obtain the renewed insurance certificate',
      CUSTOM: 'Follow up',
    },
    activity: {
      created: (ref: string) => `Lease ${ref} created`,
      signed: 'Signed lease agreement uploaded',
      indexation: 'Indexation applied to passing rent',
      review: 'Rent review settled',
      holding: 'Lease is holding over past its expiry date',
      expired: 'Lease expired',
      terminated: 'Lease terminated by agreement',
      renewalServed: 'Renewal notice served on the landlord',
      breakDeclined: 'Decided not to exercise the break option',
      insuranceUploaded: 'Insurance certificate for the year uploaded',
      reviewAgreed: 'Rent review agreed with the landlord',
    },
  },
  ar: {
    breakTerms: 'حق إنهاء مبكر للمستأجر بإشعار كتابي لا تقل مدته عن ستة أشهر، مع تسليم العين خالية وسداد الإيجار حتى تاريخه.',
    renewTerms: (years: number) => `خيار التجديد لمدة ${years} سنوات بإيجار السوق، وبالشروط ذاتها فيما عدا ذلك.`,
    keyDate: {
      EXPIRY: 'انتهاء العقد', BREAK_NOTICE: 'آخر موعد لإشعار الإنهاء المبكر', RENEWAL_NOTICE: 'آخر موعد لإشعار التجديد',
      RENT_REVIEW: 'مراجعة الإيجار', DEPOSIT_RETURN: 'موعد استرداد التأمين', INSURANCE: 'تجديد شهادة التأمين', CUSTOM: 'موعد مهم',
    } satisfies Record<KeyDateKind, string>,
    task: {
      EXPIRY: 'تحديد الإخلاء أو التجديد وإبلاغ المؤجر',
      BREAK_NOTICE: 'تأكيد قرار الإنهاء المبكر وإرسال الإشعار عند الاقتضاء',
      RENEWAL_NOTICE: 'إعداد شروط التجديد وإرسال الإشعار',
      RENT_REVIEW_FIXED: 'التحقق من الإيجار بعد الزيادة في الفاتورة القادمة',
      RENT_REVIEW: 'الاتفاق مع المؤجر على الإيجار بعد المراجعة',
      DEPOSIT_RETURN: 'متابعة استرداد التأمين',
      INSURANCE: 'الحصول على شهادة التأمين المجددة',
      CUSTOM: 'متابعة',
    },
    activity: {
      created: (ref: string) => `أُنشئ العقد ${ref}`,
      signed: 'رُفعت نسخة العقد الموقعة',
      indexation: 'طُبّقت زيادة المؤشر على الإيجار الحالي',
      review: 'اكتملت مراجعة الإيجار',
      holding: 'العقد ممتد بعد تاريخ انتهائه',
      expired: 'انتهى العقد',
      terminated: 'فُسخ العقد بالاتفاق',
      renewalServed: 'أُرسل إشعار التجديد إلى المؤجر',
      breakDeclined: 'تقرّر عدم ممارسة حق الإنهاء المبكر',
      insuranceUploaded: 'رُفعت شهادة التأمين للسنة',
      reviewAgreed: 'اتُّفق مع المؤجر على مراجعة الإيجار',
    },
  },
} as const;

export const seedText = (region: 'EA' | 'GULF' | 'EU') => TEXT[(region === 'GULF' ? 'ar' : 'en') as Lang];
