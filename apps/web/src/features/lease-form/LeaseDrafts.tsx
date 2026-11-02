import { useState } from 'react';
import { graphql, useMutation, usePaginationFragment } from 'react-relay';
import { useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { useTheme } from '@mui/material/styles';
import { FileClock, Trash2 } from 'lucide-react';
import type { LeaseDrafts_viewer$key } from './__generated__/LeaseDrafts_viewer.graphql';
import type { LeaseDraftsDiscardMutation } from './__generated__/LeaseDraftsDiscardMutation.graphql';
import { useToast } from '../../shell/Toast.tsx';
import { isStep, parseForm } from './model.ts';
import { clearLocal } from './useAutosave.ts';

export const discardDraftMutation = graphql`
  mutation LeaseDraftsDiscardMutation($input: DiscardLeaseDraftInput!, $connections: [ID!]!) {
    discardLeaseDraft(input: $input) {
      __typename
      ... on MutationDiscardLeaseDraftSuccess { data { deletedDraftId @deleteEdge(connections: $connections) } }
      ... on DomainError { message }
    }
  }
`;

// The person's unfinished drafts, newest first, so they can pick up where they left off.
export function LeaseDrafts({ viewer, currentDraftId }: { viewer: LeaseDrafts_viewer$key; currentDraftId: string | null }) {
  const { data, loadNext, hasNext, isLoadingNext } = usePaginationFragment(
    graphql`
      fragment LeaseDrafts_viewer on Viewer
      @refetchable(queryName: "LeaseDraftsPaginationQuery")
      @argumentDefinitions(first: { type: "Int", defaultValue: 5 }, after: { type: "String" }) {
        leaseDrafts(first: $first, after: $after) @connection(key: "LeaseDrafts_leaseDrafts") {
          __id
          totalCount
          edges { node { id data currentStep updatedAt lease { reference } } }
        }
      }
    `,
    viewer,
  );
  const intl = useIntl();
  const t = useTheme().tokens;
  const toast = useToast();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [discard, discarding] = useMutation<LeaseDraftsDiscardMutation>(discardDraftMutation);
  const drafts = data.leaseDrafts.edges.map((e) => e.node).filter((d) => d.id !== currentDraftId);
  if (drafts.length === 0) return null;

  const name = (d: (typeof drafts)[number]) => {
    if (d.lease) return intl.formatMessage({ id: 'leaseForm.draft.amendmentOf' }, { reference: d.lease.reference });
    const form = parseForm(d.data);
    return [form.parties.landlord.name, form.property.premises].filter(Boolean).join(' · ') || intl.formatMessage({ id: 'leaseForm.draft.untitled' });
  };
  const daysAgo = (iso: string) => Math.round((Date.parse(iso) - Date.now()) / 86_400_000);

  return (
    <Box component="aside" aria-labelledby="drafts-title" sx={{ mt: 10, pt: 6, borderTop: `1px solid ${t.rule}` }}>
      <Box component="h2" id="drafts-title" sx={{ m: 0, fontSize: '0.875rem', fontWeight: 600 }}>{intl.formatMessage({ id: 'leaseForm.draft.yours' })}</Box>
      <Box sx={{ fontSize: '0.75rem', color: t.inkSecondary, mb: 3 }}>{intl.formatMessage({ id: 'leaseForm.draft.yoursHint' })}</Box>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {drafts.map((d) => {
          const days = daysAgo(d.updatedAt);
          const when = Math.abs(days) < 1
            ? intl.formatTime(d.updatedAt, { hour: '2-digit', minute: '2-digit' })
            : new Intl.RelativeTimeFormat(intl.locale, { numeric: 'auto' }).format(days, 'day');
          return (
            <Box component="li" key={d.id} sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2, borderBottom: `1px solid ${t.rule}` }}>
              <FileClock size={15} strokeWidth={1.6} aria-hidden style={{ flexShrink: 0, color: t.inkTertiary }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box
                  component={RouterLink}
                  to={`/leases/new?draft=${encodeURIComponent(d.id)}`}
                  sx={{ color: t.ink, fontWeight: 500, fontSize: '0.8125rem', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', '&:hover': { textDecoration: 'underline' } }}
                >
                  {name(d)}
                </Box>
                <Box sx={{ fontSize: '0.75rem', color: t.inkTertiary }}>
                  {intl.formatMessage({ id: 'leaseForm.draft.updated' }, { when })}
                  {isStep(d.currentStep) ? ` · ${intl.formatMessage({ id: 'leaseForm.draft.step' }, { step: intl.formatMessage({ id: `leaseForm.step.${d.currentStep}` }) })}` : ''}
                </Box>
              </Box>
              <Tooltip title={intl.formatMessage({ id: 'leaseForm.draft.discard' })}>
                <IconButton size="small" aria-label={`${intl.formatMessage({ id: 'leaseForm.draft.discard' })}: ${name(d)}`} onClick={() => setConfirm(d.id)}>
                  <Trash2 size={15} strokeWidth={1.6} />
                </IconButton>
              </Tooltip>
            </Box>
          );
        })}
      </Box>
      {hasNext && (
        <Button size="small" onClick={() => loadNext(5)} loading={isLoadingNext} sx={{ mt: 2 }}>
          {intl.formatMessage({ id: 'common.loadMore' })}
        </Button>
      )}
      <Dialog open={confirm !== null} onClose={() => !discarding && setConfirm(null)} aria-labelledby="discard-title" maxWidth="xs">
        <DialogTitle id="discard-title">{intl.formatMessage({ id: 'leaseForm.draft.discardTitle' })}</DialogTitle>
        <DialogContent><DialogContentText>{intl.formatMessage({ id: 'leaseForm.draft.discardBody' })}</DialogContentText></DialogContent>
        <DialogActions sx={{ px: 6, pb: 5 }}>
          <Button onClick={() => setConfirm(null)} disabled={discarding}>{intl.formatMessage({ id: 'common.cancel' })}</Button>
          <Button
            variant="contained"
            color="error"
            loading={discarding}
            onClick={() => {
              const id = confirm!;
              discard({
                variables: { input: { id }, connections: [data.leaseDrafts.__id] },
                onCompleted: () => { clearLocal(`draft:${id}`); setConfirm(null); toast.show(intl.formatMessage({ id: 'leaseForm.draft.discarded' })); },
                onError: () => { setConfirm(null); toast.show(intl.formatMessage({ id: 'common.error' }), 'error'); },
              });
            }}
          >
            {intl.formatMessage({ id: 'leaseForm.draft.discard' })}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
