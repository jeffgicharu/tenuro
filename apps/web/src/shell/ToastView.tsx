import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';
import type { Toast } from './Toast.tsx';

export function ToastView({ toast, onClose }: { toast: Toast; onClose(): void }) {
  return (
    <Snackbar
      key={toast.id}
      open={true}
      autoHideDuration={toast.tone === 'error' || toast.action ? 8000 : 5000}
      onClose={(_e, reason) => reason !== 'clickaway' && onClose()}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert
          severity={toast.tone}
          variant="filled"
          onClose={() => onClose()}
          role={toast.tone === 'error' ? 'alert' : 'status'}
          sx={{ minWidth: 280, alignItems: 'center' }}
          {...(toast.action ? {
            action: (
              <>
                <Button color="inherit" size="small" sx={{ fontWeight: 700 }} onClick={() => { toast.action!.onClick(); onClose(); }}>{toast.action.label}</Button>
              </>
            ),
          } : {})}
        >
          {toast.message}
        </Alert>
    </Snackbar>
  );
}
