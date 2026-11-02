import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';

type Tone = 'success' | 'info' | 'warning' | 'error';

interface Toast {
  id: number;
  message: string;
  tone: Tone;
}

interface ToastApi {
  show(message: string, tone?: Tone): void;
}

const Ctx = createContext<ToastApi>({ show: () => undefined });

const PENDING_KEY = 'tenuro.pendingToast';

// A message to show after the next full page load (used after sign-in and resets).
export function queueToastAfterReload(message: string, tone: Tone = 'success') {
  try {
    window.sessionStorage.setItem(PENDING_KEY, JSON.stringify({ message, tone }));
  } catch {
    // Without storage the message is simply skipped.
  }
}

function takePending(): Toast | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(PENDING_KEY);
    const { message, tone } = JSON.parse(raw) as { message: string; tone: Tone };
    return { id: Date.now(), message, tone };
  } catch {
    return null;
  }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Toast | null>(takePending);
  const show = useCallback((message: string, tone: Tone = 'success') => setCurrent({ id: Date.now(), message, tone }), []);
  const api = useMemo(() => ({ show }), [show]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <Snackbar
        key={current?.id}
        open={current !== null}
        autoHideDuration={current?.tone === 'error' ? 8000 : 5000}
        onClose={(_e, reason) => reason !== 'clickaway' && setCurrent(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {current ? (
          <Alert severity={current.tone} variant="filled" onClose={() => setCurrent(null)} role={current.tone === 'error' ? 'alert' : 'status'} sx={{ minWidth: 280 }}>
            {current.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
