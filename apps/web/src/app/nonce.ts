// The per-request CSP nonce the server writes into <meta name="csp-nonce">. Anything that adds a
// <style> element must carry it: emotion's caches, and the data grid's CSS-variables tag.
export const cspNonce: string | undefined =
  typeof document !== 'undefined' ? document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content || undefined : undefined;
