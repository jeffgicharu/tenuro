import { useMemo } from 'react';
import { useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { emptyLeaseForm } from '@tenuro/lease-rules';
import type { LeaseFormPageQuery } from './__generated__/LeaseFormPageQuery.graphql';
import { leaseFormQuery } from './loader.ts';
import { useRouteQuery } from '../../app/relayRoute.ts';
import { NotFound } from '../../shell/NotFound.tsx';
import { LeaseDrafts } from './LeaseDrafts.tsx';
import { LeaseFormEditor, type FormMode } from './LeaseFormEditor.tsx';
import { isStep, parseForm } from './model.ts';

export function LeaseFormPage() {
  const data = useRouteQuery<LeaseFormPageQuery>(leaseFormQuery);
  const intl = useIntl();
  const viewer = data.viewer;

  const setup = useMemo(() => {
    if (!viewer) return null;
    const template = parseForm(viewer.newLeaseTemplate, emptyLeaseForm({ currency: 'USD', lesseeEntity: '' }));
    const draftNode = data.draft && 'data' in data.draft && data.draft.data !== undefined ? data.draft : null;
    const leaseNode = data.lease && 'formData' in data.lease && data.lease.formData ? data.lease : null;
    // A draft that amends a lease resumes as an amendment of that lease.
    const amendTarget = leaseNode ?? (draftNode?.lease ?? null);
    const original = amendTarget?.formData ? parseForm(amendTarget.formData, template) : null;
    const mode: FormMode = amendTarget ? 'amend' : draftNode ? 'resume' : 'new';
    const initialData = draftNode ? parseForm(draftNode.data, original ?? template) : original ?? template;
    const initialStep = draftNode && isStep(draftNode.currentStep) ? draftNode.currentStep : mode === 'amend' ? 'review' : 'parties';
    return {
      key: `${mode}:${amendTarget?.id ?? ''}:${draftNode?.id ?? ''}`,
      mode, template, initialData, initialStep, original,
      lease: amendTarget ? { id: amendTarget.id!, reference: amendTarget.reference!, version: amendTarget.version! } : null,
      draft: draftNode ? { id: draftNode.id!, version: draftNode.version!, updatedAt: draftNode.updatedAt! } : null,
    };
  }, [viewer, data.draft, data.lease]);

  if (!viewer || !setup) return null;
  const missingLease = data.lease === null && setup.mode === 'new' && window.location.pathname.endsWith('/amend');
  if (missingLease) return <NotFound />;

  if (!viewer.canEdit) {
    return (
      <Box sx={{ px: { xs: 4, md: 8 }, py: { xs: 6, md: 10 }, maxWidth: 720 }}>
        <Alert severity="info" variant="outlined" sx={{ mb: 6 }}>
          <AlertTitle>{intl.formatMessage({ id: 'leaseForm.readOnly.title' })}</AlertTitle>
          {intl.formatMessage({ id: 'leaseForm.readOnly.body' })}
        </Alert>
        <Button component={RouterLink} to={setup.lease ? `/leases/${encodeURIComponent(setup.lease.id)}` : '/leases'} variant="contained">
          {intl.formatMessage({ id: setup.lease ? 'leaseForm.backToLease' : 'leaseForm.backToRegister' })}
        </Button>
      </Box>
    );
  }

  return (
    <LeaseFormEditor
      key={setup.key}
      mode={setup.mode}
      template={setup.template}
      initialData={setup.initialData}
      initialStep={setup.initialStep}
      original={setup.original}
      lease={setup.lease}
      draft={setup.draft}
      viewer={viewer}
      footer={setup.mode !== 'amend' ? <LeaseDrafts viewer={viewer} currentDraftId={setup.draft?.id ?? null} /> : undefined}
    />
  );
}
