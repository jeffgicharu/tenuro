import { useState } from 'react';
import { graphql, useFragment, useMutation } from 'react-relay';
import { FormattedMessage, useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { Eye, FlaskConical, RotateCcw } from 'lucide-react';
import type { SessionBanner_viewer$key } from './__generated__/SessionBanner_viewer.graphql';
import type { SessionBannerResetMutation } from './__generated__/SessionBannerResetMutation.graphql';
import { queueToastAfterReload, useToast } from './Toast.tsx';

export function SessionBanner({ viewer: ref }: { viewer: SessionBanner_viewer$key }) {
  const viewer = useFragment(
    graphql`
      fragment SessionBanner_viewer on Viewer {
        canEdit
        sandbox { writesUsed writesLimit nextResetAt }
      }
    `,
    ref,
  );
  const intl = useIntl();
  const theme = useTheme();
  const t = theme.tokens;
  const toast = useToast();
  const narrow = useMediaQuery(theme.breakpoints.down('md'), { noSsr: true });
  const [confirming, setConfirming] = useState(false);
  const [commit, resetting] = useMutation<SessionBannerResetMutation>(graphql`
    mutation SessionBannerResetMutation {
      resetMySandbox {
        __typename
        ... on DomainError { message }
      }
    }
  `);

  const sandbox = viewer.sandbox;
  const time = sandbox ? intl.formatTime(sandbox.nextResetAt, { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }) : '';

  const reset = () =>
    commit({
      variables: {},
      onCompleted: (res) => {
        if (res.resetMySandbox.__typename === 'MutationResetMySandboxSuccess') {
          queueToastAfterReload(intl.formatMessage({ id: 'workspace.resetDone' }));
          window.location.reload();
        } else {
          setConfirming(false);
          toast.show(intl.formatMessage({ id: 'common.error' }), 'error');
        }
      },
      onError: () => {
        setConfirming(false);
        toast.show(intl.formatMessage({ id: 'common.error' }), 'error');
      },
    });

  return (
    <Box
      role="region"
      aria-label={intl.formatMessage({ id: 'workspace.bannerShort' })}
      sx={{
        display: 'flex', alignItems: 'center', gap: 3, px: { xs: 3, md: 6 }, minHeight: 36, py: 1,
        backgroundColor: t.sunken, borderBottom: `1px solid ${t.rule}`, color: t.inkSecondary, fontSize: '0.8125rem',
      }}
    >
      <FlaskConical size={15} strokeWidth={1.7} aria-hidden style={{ flexShrink: 0, color: t.accent }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {narrow ? <FormattedMessage id="workspace.bannerShort" /> : <FormattedMessage id="workspace.banner" values={{ time }} />}
        {!viewer.canEdit && !narrow && (
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, marginInlineStart: 3, color: t.ink }}>
            <Eye size={14} strokeWidth={1.7} aria-hidden />
            <FormattedMessage id="workspace.readOnly" />
          </Box>
        )}
      </Box>
      {sandbox && sandbox.writesUsed > 0 && (
        <>
          {!narrow && (
            <Box component="span" data-num sx={{ whiteSpace: 'nowrap' }}>
              <FormattedMessage id="workspace.writes" values={{ used: sandbox.writesUsed, limit: sandbox.writesLimit }} />
            </Box>
          )}
          <Button size="small" variant="text" onClick={() => setConfirming(true)} startIcon={<RotateCcw size={14} strokeWidth={1.8} />} sx={{ whiteSpace: 'nowrap' }}>
            <FormattedMessage id="workspace.reset" />
          </Button>
        </>
      )}
      <Dialog open={confirming} onClose={() => !resetting && setConfirming(false)} aria-labelledby="reset-title" maxWidth="xs">
        <DialogTitle id="reset-title" sx={{ fontFamily: theme.typography.h3.fontFamily }}>
          <FormattedMessage id="workspace.resetConfirmTitle" />
        </DialogTitle>
        <DialogContent>
          <DialogContentText><FormattedMessage id="workspace.resetConfirmBody" /></DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 6, pb: 5 }}>
          <Button onClick={() => setConfirming(false)} disabled={resetting}><FormattedMessage id="common.cancel" /></Button>
          <Button onClick={reset} variant="contained" color="error" loading={resetting}><FormattedMessage id="workspace.resetConfirm" /></Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
