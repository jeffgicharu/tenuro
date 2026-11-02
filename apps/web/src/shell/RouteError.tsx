import { isRouteErrorResponse, useRouteError } from 'react-router';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';

// Last-resort boundary. It may render outside the theme and translations (if they failed), so it
// uses plain styles and English with Arabic and Swahili alongside.
export function RouteError() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  if (import.meta.env.DEV) console.error(error);
  return (
    <Box role="alert" sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 6, bgcolor: '#F4F0E7', color: '#1C1A16', fontFamily: 'system-ui, sans-serif' }}>
      <Box sx={{ maxWidth: 460 }}>
        <Box component="h1" sx={{ fontFamily: 'Georgia, serif', fontWeight: 500, fontSize: '1.75rem', m: 0, mb: 2 }}>
          {notFound ? 'This page does not exist.' : 'Something went wrong.'}
        </Box>
        <Box component="p" sx={{ m: 0, mb: 1, color: '#55504A' }}>
          {notFound ? 'The link may be out of date.' : 'Your work is saved. Reload the page to continue.'}
        </Box>
        <Box component="p" lang="ar" dir="rtl" sx={{ m: 0, mb: 1, color: '#55504A' }}>حدث خطأ. أعد تحميل الصفحة للمتابعة.</Box>
        <Box component="p" lang="sw" sx={{ m: 0, mb: 4, color: '#55504A' }}>Hitilafu imetokea. Pakia upya ukurasa ili kuendelea.</Box>
        <Button variant="contained" onClick={() => window.location.assign(notFound ? '/leases' : window.location.href)} sx={{ bgcolor: '#1C1A16' }}>
          {notFound ? 'Go to the lease register' : 'Reload'}
        </Button>
      </Box>
    </Box>
  );
}
