import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';

// Field Web Vitals from real visits, sent once per metric with sendBeacon. Routes are sent with ids
// stripped, and nothing identifies the visitor.
export function reportWebVitals() {
  if (import.meta.env.DEV) return;
  const send = (m: Metric) => {
    const body = JSON.stringify({ name: m.name, value: m.value, rating: m.rating, route: window.location.pathname });
    const blob = new Blob([body], { type: 'application/json' });
    if (!navigator.sendBeacon?.('/api/vitals', blob)) {
      void fetch('/api/vitals', { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => undefined);
    }
  };
  onLCP(send);
  onINP(send);
  onCLS(send);
  onFCP(send);
  onTTFB(send);
}
