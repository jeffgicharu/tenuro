import type { Language } from './locale.ts';

export type Messages = Record<string, string>;

// Each language loads as its own chunk; features add their messages in catalogues/<lang>.ts.
export async function loadCatalogue(language: Language): Promise<Messages> {
  switch (language) {
    case 'ar':
      return (await import('./catalogues/ar.ts')).default;
    case 'sw':
      return (await import('./catalogues/sw.ts')).default;
    default:
      return (await import('./catalogues/en.ts')).default;
  }
}
