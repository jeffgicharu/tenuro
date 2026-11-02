import { useEffect, type CSSProperties } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router';

// Last-resort boundary. It renders outside the theme, the translations and emotion's nonce-carrying
// style cache, so it uses no MUI: React applies `style` props through the CSSOM, which the strict
// CSP allows, whereas an emotion <style> tag without the nonce would be blocked and leave the page
// unstyled. It shows English with Arabic and Swahili alongside.
const ink = '#1C1A16';
const muted = '#55504A';
const s: Record<string, CSSProperties> = {
  page: { minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#F4F0E7', color: ink, fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
  card: { maxWidth: 460 },
  title: { fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 500, fontSize: '1.75rem', lineHeight: 1.2, margin: '0 0 8px' },
  text: { margin: '0 0 4px', color: muted, lineHeight: 1.5 },
  last: { margin: '0 0 20px', color: muted, lineHeight: 1.5 },
  button: { font: 'inherit', fontWeight: 600, color: '#FBF9F4', background: ink, border: 0, borderRadius: 4, padding: '9px 16px', cursor: 'pointer', minHeight: 40 },
};

export function RouteError() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  useEffect(() => {
    if (!notFound) console.error(error);
  }, [error, notFound]);
  return (
    // dir="ltr": the document may still be right-to-left, which would put the English full stops at
    // the wrong end. Each language line carries its own lang and direction.
    <div role="alert" dir="ltr" lang="en" style={s.page}>
      <div style={s.card}>
        <h1 lang="en" style={s.title}>{notFound ? 'This page does not exist.' : 'Something went wrong.'}</h1>
        <p style={s.text}>{notFound ? 'The link may be out of date.' : 'Your work is saved. Reload the page to continue.'}</p>
        <p lang="ar" dir="rtl" style={s.text}>{notFound ? 'قد يكون الرابط قديماً.' : 'حدث خطأ. أعد تحميل الصفحة للمتابعة.'}</p>
        <p lang="sw" style={s.last}>{notFound ? 'Huenda kiungo kimepitwa na wakati.' : 'Hitilafu imetokea. Pakia upya ukurasa ili kuendelea.'}</p>
        <button type="button" style={s.button} onClick={() => window.location.assign(notFound ? '/leases' : window.location.href)}>
          {notFound ? 'Go to the lease register' : 'Reload'}
        </button>
      </div>
    </div>
  );
}
