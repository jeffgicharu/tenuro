import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { graphql, useMutation } from 'react-relay';
import { useIntl } from 'react-intl';
import { useNavigate, Link as RouterLink } from 'react-router';
import type { RecordSourceSelectorProxy } from 'relay-runtime';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { keyframes, useTheme } from '@mui/material/styles';
import { ArrowLeft, ArrowRight, Check, CloudOff, LoaderCircle, Trash2 } from 'lucide-react';
import { LEASE_FORM_STEPS, validateLease, type LeaseFormData, type LeaseFormStep } from '@tenuro/lease-rules';
import type { PropertyPicker_viewer$key } from '../../components/__generated__/PropertyPicker_viewer.graphql';
import { ErrorSummary } from '../../components/ErrorSummary.tsx';
import { FormStepper, type StepperItem } from '../../components/FormStepper.tsx';
import { useToast } from '../../shell/Toast.tsx';
import type { LeaseFormEditorSubmitMutation } from './__generated__/LeaseFormEditorSubmitMutation.graphql';
import type { LeaseFormEditorAmendMutation } from './__generated__/LeaseFormEditorAmendMutation.graphql';
import type { LeaseDraftsDiscardMutation } from './__generated__/LeaseDraftsDiscardMutation.graphql';
import { discardDraftMutation } from './LeaseDrafts.tsx';
import { fieldId, formToInput, labelKey } from './model.ts';
import { FormProvider, initialState, serverIssuesFrom, translateIssue, useFormReducer, type ServerIssue } from './state.tsx';
import { chooseRestore, clearLocal, readLocal, useAutosave, writeLocal } from './useAutosave.ts';
import { PartiesStep } from './steps/PartiesStep.tsx';
import { PropertyStep } from './steps/PropertyStep.tsx';
import { TermStep } from './steps/TermStep.tsx';
import { RentStep } from './steps/RentStep.tsx';
import { OptionsStep } from './steps/OptionsStep.tsx';
import { DepositsStep } from './steps/DepositsStep.tsx';
import { AccountingStep } from './steps/AccountingStep.tsx';
import { ReviewStep } from './steps/ReviewStep.tsx';

const spin = keyframes`to { transform: rotate(360deg); }`;

const submitMutation = graphql`
  mutation LeaseFormEditorSubmitMutation($input: SubmitLeaseInput!) {
    submitLease(input: $input) {
      __typename
      ... on MutationSubmitLeaseSuccess { data { lease { id reference } } }
      ... on ValidationFailed { fieldErrors { path code message step } }
      ... on StaleVersion { currentVersion }
      ... on QuotaExceeded { limit }
      ... on PermissionDenied { requiredRole }
      ... on DomainError { message }
    }
  }
`;

const amendMutation = graphql`
  mutation LeaseFormEditorAmendMutation($input: AmendLeaseInput!) {
    amendLease(input: $input) {
      __typename
      ... on MutationAmendLeaseSuccess { data { lease { id reference version formData } } }
      ... on ValidationFailed { fieldErrors { path code message step } }
      ... on StaleVersion { currentVersion }
      ... on QuotaExceeded { limit }
      ... on PermissionDenied { requiredRole }
      ... on DomainError { message }
    }
  }
`;

// A new or changed lease changes register totals, key dates and facets, so after saving every cached
// query is marked stale and refetched when next shown. When the default register view is loaded,
// the new lease is also put at its top straight away.
function afterLeaseSaved(store: RecordSourceSelectorProxy, leaseId: string | undefined, isNew: boolean) {
  if (isNew && leaseId) {
    const viewer = store.getRoot().getLinkedRecord('viewer');
    const lease = store.get(leaseId);
    if (viewer && lease) {
      for (const key of ['__RegisterGrid_leases_connection', '__RegisterGrid_leases_connection(filter:null,orderBy:null)']) {
        const c = viewer.getLinkedRecord(key);
        if (!c) continue;
        const edge = store.create(`client:newLeaseEdge:${leaseId}`, 'ViewerLeasesConnectionEdge');
        edge.setLinkedRecord(lease, 'node');
        const edges = c.getLinkedRecords('edges') ?? [];
        c.setLinkedRecords([edge, ...edges], 'edges');
      }
    }
  }
  store.invalidateStore();
}

export type FormMode = 'new' | 'amend' | 'resume';

export interface EditorProps {
  mode: FormMode;
  template: LeaseFormData;
  initialData: LeaseFormData;
  initialStep: LeaseFormStep;
  original: LeaseFormData | null;
  lease: { id: string; reference: string; version: number } | null;
  draft: { id: string; version: number; updatedAt: string } | null;
  viewer: PropertyPicker_viewer$key;
  footer?: React.ReactNode;
}

const STEP_COMPONENT: Record<Exclude<LeaseFormStep, 'property' | 'review'>, () => React.JSX.Element> = {
  parties: PartiesStep, term: TermStep, rent: RentStep, options: OptionsStep, deposits: DepositsStep, accounting: AccountingStep,
};

const stepFromHash = (): LeaseFormStep | null => {
  const h = window.location.hash.slice(1);
  return (LEASE_FORM_STEPS as readonly string[]).includes(h) ? (h as LeaseFormStep) : null;
};

export function LeaseFormEditor(props: EditorProps) {
  const intl = useIntl();
  const theme = useTheme();
  const t = theme.tokens;
  const navigate = useNavigate();
  const toast = useToast();
  const compact = useMediaQuery(theme.breakpoints.down('md'), { noSsr: true });
  const m = (id: string, values?: Record<string, string | number>) => intl.formatMessage({ id }, values);

  const baseKey = props.mode === 'amend' && props.lease ? `amend:${props.lease.id}` : props.draft ? `draft:${props.draft.id}` : 'new';
  // A browser copy newer than the server's is restored (it may hold work the server never got).
  const restored = useMemo(
    () => chooseRestore(readLocal(baseKey), props.initialData, props.draft?.updatedAt ?? null),
    [baseKey, props.draft, props.initialData],
  );

  const [draftId, setDraftId] = useState<string | null>(props.draft?.id ?? restored?.draftId ?? null);
  const storageKey = props.mode === 'amend' && props.lease ? `amend:${props.lease.id}` : draftId ? `draft:${draftId}` : 'new';
  const [baseVersion, setBaseVersion] = useState<number | null>(props.lease ? (restored?.baseVersion ?? props.lease.version) : null);

  const [state, dispatch] = useFormReducer(() => {
    const data = restored?.data ?? props.initialData;
    const step = stepFromHash() ?? restored?.step ?? props.initialStep;
    return { ...initialState(data, step, props.mode), dirty: Boolean(restored) };
  });
  const [stale, setStale] = useState<{ currentVersion: number; source: 'draft' | 'lease' } | null>(null);
  const [banner, setBanner] = useState<{ tone: 'error' | 'warning'; text: string } | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (restored) toast.show(m('leaseForm.draft.restored'), 'info');
    // Only on first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const autosave = useAutosave({
    enabled: true,
    data: state.data,
    step: state.step,
    dirty: state.dirty,
    storageKey,
    leaseId: props.lease?.id ?? null,
    initialDraftId: draftId,
    initialVersion: props.draft?.version ?? restored?.draftVersion ?? null,
    baseVersion,
    onStale: (currentVersion) => setStale({ currentVersion, source: 'draft' }),
    onDraftCreated: (id) => {
      setDraftId(id);
      if (props.mode !== 'amend') {
        const copy = readLocal('new');
        if (copy) writeLocal(`draft:${id}`, { ...copy, draftId: id });
        clearLocal('new');
        const url = new URL(window.location.href);
        url.searchParams.set('draft', id);
        window.history.replaceState(window.history.state, '', url);
      }
    },
  });

  // The step lives in the URL hash, so a reload or a shared link opens the same section.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.hash !== `#${state.step}`) {
      url.hash = state.step;
      window.history.replaceState(window.history.state, '', url);
    }
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    headingRef.current?.focus({ preventScroll: true });
  }, [state.step]);

  const goto = useCallback((step: LeaseFormStep) => { setBanner(null); dispatch({ type: 'goto', step }); }, [dispatch]);

  // Editing the hash, or following a link to "#rent", changes only the hash and does not reload,
  // so follow it here too.
  useEffect(() => {
    const onHash = () => {
      const step = stepFromHash();
      if (step) goto(step);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [goto]);
  const index = LEASE_FORM_STEPS.indexOf(state.step);
  const nextStep = LEASE_FORM_STEPS[index + 1];
  const prevStep = LEASE_FORM_STEPS[index - 1];

  const next = () => {
    const issues = validateLease(state.data, [state.step]);
    dispatch({ type: 'attempt', steps: [state.step] });
    if (issues.length) {
      window.setTimeout(() => summaryRef.current?.focus(), 0);
      return;
    }
    if (nextStep === 'review') dispatch({ type: 'attempt', steps: LEASE_FORM_STEPS.slice(0, -1) });
    if (nextStep) goto(nextStep);
  };

  const [submit, submitting] = useMutation<LeaseFormEditorSubmitMutation>(submitMutation);
  const [amend, amending] = useMutation<LeaseFormEditorAmendMutation>(amendMutation);
  const [discard, discarding] = useMutation<LeaseDraftsDiscardMutation>(discardDraftMutation);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // Stays true from a successful save until the lease page replaces the form, so the button keeps
  // its spinner while that page loads instead of looking idle under a "created" notice.
  const [leaving, setLeaving] = useState(false);
  const busy = submitting || amending || leaving;

  const applyServerIssues = (errors: readonly { path: string; code: string; message: string; step: string | null }[]) => {
    const issues: ServerIssue[] = serverIssuesFrom(errors);
    dispatch({ type: 'server', issues });
    const first = issues[0];
    // Move to the step directly: goto() clears the banner, and this banner explains the jump.
    if (first && first.step !== state.step) dispatch({ type: 'goto', step: first.step });
    setBanner({ tone: 'error', text: m('leaseForm.submit.serverErrors', { count: issues.length }) });
    if (first) window.setTimeout(() => document.getElementById(fieldId(first.path))?.focus(), 80);
  };

  type Result = { __typename: string; fieldErrors?: readonly { path: string; code: string; message: string; step: string | null }[]; currentVersion?: number };
  const handleFailure = (r: Result) => {
    if (r.__typename === 'ValidationFailed' && r.fieldErrors) applyServerIssues(r.fieldErrors);
    else if (r.__typename === 'StaleVersion' && r.currentVersion !== undefined) setStale({ currentVersion: r.currentVersion, source: 'lease' });
    else if (r.__typename === 'QuotaExceeded') setBanner({ tone: 'warning', text: m('leaseForm.submit.quota') });
    else if (r.__typename === 'PermissionDenied') setBanner({ tone: 'error', text: m('leaseForm.submit.denied') });
    else setBanner({ tone: 'error', text: m('common.error') });
  };

  const onSaved = (lease: { id: string; reference: string }, message: string) => {
    autosave.pause();
    setLeaving(true);
    clearLocal(storageKey);
    clearLocal(baseKey);
    toast.show(message);
    navigate(`/leases/${encodeURIComponent(lease.id)}`);
  };

  const save = () => {
    setBanner(null);
    const issues = validateLease(state.data);
    if (issues.length) {
      dispatch({ type: 'attempt', steps: LEASE_FORM_STEPS });
      if (state.step !== 'review') goto('review');
      window.setTimeout(() => summaryRef.current?.focus(), 60);
      return;
    }
    const input = formToInput(state.data);
    const draft = autosave.draftId() ?? draftId;
    const onError = () => setBanner({ tone: 'error', text: m('leaseForm.submit.networkError') });
    if (props.mode === 'amend' && props.lease) {
      amend({
        variables: { input: { id: props.lease.id, version: baseVersion ?? props.lease.version, lease: input, draftId: draft } },
        updater: (store) => afterLeaseSaved(store, props.lease?.id, false),
        onCompleted: (res) => {
          const r = res.amendLease;
          const lease = r.__typename === 'MutationAmendLeaseSuccess' ? r.data?.lease : undefined;
          if (lease) onSaved(lease, m('leaseForm.submit.amended', { reference: lease.reference }));
          else handleFailure(r as Result);
        },
        onError,
      });
    } else {
      submit({
        variables: { input: { lease: input, draftId: draft } },
        updater: (store, res) => afterLeaseSaved(store, res?.submitLease.__typename === 'MutationSubmitLeaseSuccess' ? res.submitLease.data?.lease.id : undefined, true),
        onCompleted: (res) => {
          const r = res.submitLease;
          const lease = r.__typename === 'MutationSubmitLeaseSuccess' ? r.data?.lease : undefined;
          if (lease) onSaved(lease, m('leaseForm.submit.created', { reference: lease.reference }));
          else handleFailure(r as Result);
        },
        onError,
      });
    }
  };

  const issueCount = (step: LeaseFormStep) => validateLease(state.data, [step]).length + state.server.filter((s) => s.step === step).length;
  const items: StepperItem[] = LEASE_FORM_STEPS.map((step) => {
    const n = step === 'review' ? 0 : issueCount(step);
    const seen = state.visited.has(step) || state.attempted.has(step);
    return {
      key: step,
      label: m(`leaseForm.step.${step}`),
      hint: m(`leaseForm.stepHint.${step}`),
      issues: n,
      state: step === state.step ? 'current' : !seen ? 'untouched' : n > 0 ? 'issues' : 'complete',
    };
  });

  const shown = useMemo(() => {
    // Summary at the top of the step: on review every outstanding issue, elsewhere this step's.
    const all = validateLease(state.data);
    const relevant = state.step === 'review' ? all : all.filter((i) => i.step === state.step);
    const attempted = state.step === 'review' ? state.attempted.size > 0 : state.attempted.has(state.step);
    const local = attempted ? relevant : [];
    const server = state.server.filter((s) => (state.step === 'review' || s.step === state.step) && !local.some((l) => l.path === s.path));
    return [...local, ...server];
  }, [state.data, state.step, state.attempted, state.server]);

  const fieldLabel = (path: string) => {
    const key = labelKey(path);
    const idx = /\.(\d+)\./.exec(path)?.[1];
    const base = intl.messages[key] ? m(key) : path;
    return idx !== undefined ? `${base} (${Number(idx) + 1})` : base;
  };

  const statusLine = (() => {
    const s = autosave.status;
    if (s === 'saving') return { icon: <LoaderCircle size={14} className="spin" aria-hidden />, text: m('leaseForm.draft.saving') };
    if (s === 'saved' && autosave.savedAt) return { icon: <Check size={14} aria-hidden />, text: m('leaseForm.draft.savedAt', { time: intl.formatTime(autosave.savedAt, { hour: '2-digit', minute: '2-digit' }) }) };
    if (s === 'saved') return { icon: <Check size={14} aria-hidden />, text: m('leaseForm.draft.savedLocally') };
    if (s === 'retrying') return { icon: <CloudOff size={14} aria-hidden />, text: m('leaseForm.draft.retrying') };
    if (s === 'local') return { icon: <CloudOff size={14} aria-hidden />, text: m('leaseForm.draft.savedLocally') };
    return state.dirty ? { icon: <Check size={14} aria-hidden />, text: m('leaseForm.draft.savedLocally') } : null;
  })();

  const title = props.mode === 'amend' && props.lease ? m('leaseForm.title.amend', { reference: props.lease.reference }) : props.mode === 'resume' ? m('leaseForm.title.resume') : m('leaseForm.title.new');
  const StepBody = state.step === 'property' || state.step === 'review' ? null : STEP_COMPONENT[state.step];

  return (
    <FormProvider state={state} dispatch={dispatch}>
      <Box sx={{ px: { xs: 4, md: 8, xl: 12 }, pt: { xs: 5, md: 8 }, pb: { xs: 28, md: 16 }, maxWidth: 1240, '& input, & textarea, & .MuiSelect-select': { fontSize: { xs: 16, md: 14 } }, '& .spin': { animation: `${spin} 900ms linear infinite` } }}>
        <Box sx={{ mb: { xs: 5, md: 8 } }}>
          <Button
            component={RouterLink}
            to={props.lease ? `/leases/${encodeURIComponent(props.lease.id)}` : '/leases'}
            size="small"
            variant="text"
            startIcon={<ArrowLeft size={15} style={theme.direction === 'rtl' ? { transform: 'scaleX(-1)' } : undefined} />}
            sx={{ mb: 3, marginInlineStart: -2 }}
          >
            {props.lease ? m('leaseForm.backToLease') : m('leaseForm.backToRegister')}
          </Button>
          <Box sx={{ display: 'flex', alignItems: { xs: 'flex-start', md: 'flex-end' }, justifyContent: 'space-between', gap: 4, flexWrap: 'wrap' }}>
            <Box sx={{ maxWidth: 640 }}>
              <Typography variant="h1" sx={{ fontSize: { xs: '1.75rem', md: '2.25rem' } }}>{title}</Typography>
              <Typography color="text.secondary" sx={{ mt: 2 }}>{props.mode === 'amend' ? m('leaseForm.lede.amend') : m('leaseForm.lede.new')}</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <Box role="status" aria-live="polite" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontSize: '0.8125rem', color: autosave.status === 'retrying' ? t.warning : t.inkSecondary, minHeight: 24 }}>
                {statusLine && <>{statusLine.icon}<span>{statusLine.text}</span></>}
              </Box>
              {draftId && (
                <Button size="small" variant="text" startIcon={<Trash2 size={14} />} onClick={() => setConfirmDiscard(true)}>{m('leaseForm.draft.discard')}</Button>
              )}
            </Box>
          </Box>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '232px minmax(0, 1fr)' }, gap: { xs: 5, md: 10 }, alignItems: 'start' }}>
          <Box sx={{ position: { md: 'sticky' }, top: { md: 24 } }}>
            <FormStepper items={items} current={state.step} onSelect={(k) => goto(k as LeaseFormStep)} label={m('leaseForm.stepper.label')} compact={compact} />
          </Box>

          <Box component="section" aria-labelledby="step-heading" sx={{ minWidth: 0, maxWidth: 780, pb: { xs: 'calc(104px + env(safe-area-inset-bottom))', md: 0 } }}>
            <Box sx={{ mb: 6 }}>
              {/* The compact stepper already says "Section n of 8" right above. */}
              {!compact && (
                <Box sx={{ fontSize: '0.75rem', color: t.inkTertiary, mb: 1 }} data-num>
                  {m('leaseForm.stepper.progress', { current: index + 1, total: LEASE_FORM_STEPS.length })}
                </Box>
              )}
              <Typography variant="h2" id="step-heading" ref={headingRef} tabIndex={-1} sx={{ outline: 'none' }}>
                {m(`leaseForm.step.${state.step}`)}
              </Typography>
              <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
                {state.step === 'review' ? m('leaseForm.review.lede') : m(`leaseForm.stepHint.${state.step}`)}
              </Typography>
            </Box>

            {banner && <Alert severity={banner.tone} sx={{ mb: 5 }} onClose={() => setBanner(null)}>{banner.text}</Alert>}

            {shown.length > 0 && (
              <ErrorSummary
                ref={summaryRef}
                title={m(state.step === 'review' ? 'leaseForm.summary.reviewTitle' : 'leaseForm.summary.title', { count: shown.length })}
                items={shown.map((i, n) => ({
                  key: `${i.path}-${n}`,
                  label: state.step === 'review' ? `${m(`leaseForm.step.${i.step}`)} · ${fieldLabel(i.path)}` : fieldLabel(i.path),
                  message: translateIssue(intl, i),
                  target: fieldId(i.path),
                  ...(state.step === 'review' && i.step !== 'review' ? { onSelect: () => goto(i.step) } : {}),
                }))}
              />
            )}

            {state.step === 'property' ? <PropertyStep viewer={props.viewer} /> : state.step === 'review' ? <ReviewStep original={props.original} onEdit={goto} /> : StepBody ? <StepBody /> : null}

            <Box
              sx={{
                // On a phone the actions sit on a solid bar pinned to the bottom of the screen (clear of the
                // home indicator); the section leaves room below so its last field scrolls clear of it.
                display: 'flex', justifyContent: 'space-between', gap: 3, mt: { xs: 0, md: 8 }, pt: { xs: 3, md: 5 }, borderTop: `1px solid ${t.ruleStrong}`,
                position: { xs: 'fixed', md: 'static' }, insetInline: { xs: 0, md: 'auto' }, bottom: { xs: 0, md: 'auto' }, zIndex: (th) => th.zIndex.appBar,
                backgroundColor: { xs: t.surface, md: 'transparent' }, px: { xs: 4, md: 0 },
                pb: { xs: 'calc(12px + env(safe-area-inset-bottom))', md: 0 },
                boxShadow: { xs: `0 -10px 24px -14px ${t.mode === 'dark' ? 'rgba(0,0,0,0.7)' : 'rgba(40,30,10,0.28)'}`, md: 'none' },
              }}
            >
              <Button variant="outlined" onClick={() => prevStep && goto(prevStep)} disabled={!prevStep || busy} startIcon={<ArrowLeft size={15} style={theme.direction === 'rtl' ? { transform: 'scaleX(-1)' } : undefined} />}>
                {m('leaseForm.nav.back')}
              </Button>
              {state.step === 'review' ? (
                <Button variant="contained" onClick={save} loading={busy} loadingPosition="start" startIcon={<Check size={16} />} sx={{ minWidth: 160 }}>
                  {busy ? m('leaseForm.submit.submitting') : m(props.mode === 'amend' ? 'leaseForm.submit.amend' : 'leaseForm.submit.new')}
                </Button>
              ) : (
                <Button variant="contained" onClick={next} endIcon={<ArrowRight size={15} style={theme.direction === 'rtl' ? { transform: 'scaleX(-1)' } : undefined} />}>
                  {nextStep === 'review' ? m('leaseForm.nav.review') : m('leaseForm.nav.next', { step: m(`leaseForm.step.${nextStep}`) })}
                </Button>
              )}
            </Box>
            {props.footer}
          </Box>
        </Box>
      </Box>

      <Dialog open={stale !== null} aria-labelledby="stale-title" maxWidth="sm">
        <DialogTitle id="stale-title">{m('leaseForm.stale.title')}</DialogTitle>
        <DialogContent><DialogContentText>{m('leaseForm.stale.body')}</DialogContentText></DialogContent>
        <DialogActions sx={{ px: 6, pb: 5, gap: 2, flexWrap: 'wrap' }}>
          <Button onClick={() => { clearLocal(storageKey); clearLocal(baseKey); window.location.reload(); }}>{m('leaseForm.stale.reload')}</Button>
          <Button
            variant="contained"
            onClick={() => {
              if (!stale) return;
              if (stale.source === 'draft') autosave.resume(stale.currentVersion);
              else setBaseVersion(stale.currentVersion);
              setStale(null);
            }}
          >
            {m('leaseForm.stale.keep')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmDiscard} onClose={() => !discarding && setConfirmDiscard(false)} aria-labelledby="discard-current-title" maxWidth="xs">
        <DialogTitle id="discard-current-title">{m('leaseForm.draft.discardTitle')}</DialogTitle>
        <DialogContent><DialogContentText>{m('leaseForm.draft.discardBody')}</DialogContentText></DialogContent>
        <DialogActions sx={{ px: 6, pb: 5 }}>
          <Button onClick={() => setConfirmDiscard(false)} disabled={discarding}>{m('common.cancel')}</Button>
          <Button
            variant="contained"
            color="error"
            loading={discarding}
            onClick={() => {
              const id = autosave.draftId() ?? draftId;
              if (!id) return;
              autosave.pause();
              discard({
                variables: { input: { id }, connections: [] },
                updater: (store) => store.invalidateStore(),
                onCompleted: () => {
                  clearLocal(storageKey);
                  clearLocal(baseKey);
                  toast.show(m('leaseForm.draft.discarded'));
                  navigate(props.lease ? `/leases/${encodeURIComponent(props.lease.id)}` : '/leases');
                },
                onError: () => { setConfirmDiscard(false); toast.show(m('common.error'), 'error'); },
              });
            }}
          >
            {m('leaseForm.draft.discard')}
          </Button>
        </DialogActions>
      </Dialog>
    </FormProvider>
  );
}
