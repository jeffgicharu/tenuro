import { FormattedMessage } from 'react-intl';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import { useTheme } from '@mui/material/styles';

// Confirms resetting the visitor's private changes (from the session banner).
export function ResetDialog({ open, resetting, onCancel, onConfirm }: { open: boolean; resetting: boolean; onCancel(): void; onConfirm(): void }) {
  const theme = useTheme();
  return (
    <Dialog open={open} onClose={() => !resetting && onCancel()} aria-labelledby="reset-title" maxWidth="xs">
      <DialogTitle id="reset-title" sx={{ fontFamily: theme.typography.h3.fontFamily }}>
        <FormattedMessage id="workspace.resetConfirmTitle" />
      </DialogTitle>
      <DialogContent>
        <DialogContentText><FormattedMessage id="workspace.resetConfirmBody" /></DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 6, pb: 5 }}>
        <Button onClick={onCancel} disabled={resetting}><FormattedMessage id="common.cancel" /></Button>
        <Button onClick={onConfirm} variant="contained" color="error" loading={resetting}><FormattedMessage id="workspace.resetConfirm" /></Button>
      </DialogActions>
    </Dialog>
  );
}
