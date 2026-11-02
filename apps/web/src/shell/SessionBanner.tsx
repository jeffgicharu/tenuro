import { lazy, Suspense, useState } from 'react';
import { graphql, useFragment, useMutation } from 'react-relay';
import { FormattedMessage, useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { Eye, LockKeyhole, RotateCcw } from 'lucide-react';
import type { SessionBanner_viewer$key } from './__generated__/SessionBanner_viewer.graphql';
import type { SessionBannerResetMutation } from './__generated__/SessionBannerResetMutation.graphql';
import { queueToastAfterReload, useToast } from './Toast.tsx';

const ResetDialog = lazy(async () => ({ default: (await import('./ResetDialog.tsx')).ResetDialog }));

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
  const [confirming, setConfirmingState] = useState(false);
  // Once opened, the dialog stays mounted so it can animate closed.
  const [confirmed, setConfirmed] = useState(false);
  const setConfirming = (v: boolean) => { if (v) setConfirmed(true); setConfirmingState(v); };
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
      aria-label={intl.formatMessage({ id: 'workspace.bannerShort' }, { time })}
      sx={{
        display: 'flex', alignItems: 'center', gap: 3, px: { xs: 3, md: 6 }, minHeight: 36, py: 1,
        backgroundColor: t.sunken, borderBottom: `1px solid ${t.rule}`, color: t.inkSecondary, fontSize: '0.8125rem',
      }}
    >
      <LockKeyhole size={15} strokeWidth={1.7} aria-hidden style={{ flexShrink: 0, color: t.accent }} />
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 3, rowGap: 0.5, lineHeight: 1.4 }}>
        <span>{narrow ? <FormattedMessage id="workspace.bannerShort" values={{ time }} /> : <FormattedMessage id="workspace.banner" values={{ time }} />}</span>
        {!viewer.canEdit && !narrow && (
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, color: t.ink }}>
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
      {/* The confirmation's code loads the first time it is asked for. */}
      {confirmed && (
        <Suspense fallback={null}>
          <ResetDialog open={confirming} resetting={resetting} onCancel={() => setConfirming(false)} onConfirm={reset} />
        </Suspense>
      )}
    </Box>
  );
}
