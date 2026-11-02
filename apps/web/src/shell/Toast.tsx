import { createContext, lazy, Suspense, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

const ToastView = lazy(async () => ({ default: (await import('./ToastView.tsx')).ToastView }));

export type Tone = 'success' | 'info' | 'warning' | 'error';

export interface ToastAction {
  label: string;
  onClick(): void;
}

export interface Toast {
  id: number;
  message: string;
  tone: Tone;
  action?: ToastAction | undefined;
}

interface ToastApi {
  // An action (e.g. Undo) keeps the toast up a little longer, so there is time to use it.
  show(message: string, tone?: Tone, action?: ToastAction): void;
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
  const show = useCallback((message: string, tone: Tone = 'success', action?: ToastAction) => setCurrent({ id: Date.now(), message, tone, action }), []);
  const api = useMemo(() => ({ show }), [show]);
  return (
    <Ctx.Provider value={api}>
      {children}
      {/* The toast's code loads with the first toast, not with the page. */}
      {current && (
        <Suspense fallback={null}>
          <ToastView toast={current} onClose={() => setCurrent(null)} />
        </Suspense>
      )}
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
