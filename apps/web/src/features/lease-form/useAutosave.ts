import { useCallback, useEffect, useRef, useState } from 'react';
import { graphql, useMutation } from 'react-relay';
import type { LeaseFormData, LeaseFormStep } from '@tenuro/lease-rules';
import type { useAutosaveSaveDraftMutation } from './__generated__/useAutosaveSaveDraftMutation.graphql';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'retrying' | 'local';

const DEBOUNCE_MS = 1200;
const BACKOFF_MS = [2000, 4000, 8000, 16000, 30000];

export interface LocalCopy {
  data: LeaseFormData;
  step: LeaseFormStep;
  at: number;
  draftId: string | null;
  draftVersion: number | null;
  // For an amendment: the lease version the edit started from, so a stale edit is still caught.
  baseVersion: number | null;
}

const PREFIX = 'tenuro.leaseForm.';

export function readLocal(key: string): LocalCopy | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as LocalCopy) : null;
  } catch {
    return null;
  }
}

export function writeLocal(key: string, copy: LocalCopy) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(copy));
  } catch {
    // Full or unavailable storage: the server draft is still the backup.
  }
}

export function clearLocal(key: string) {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    // Nothing to clear.
  }
}

interface Options {
  enabled: boolean;
  data: LeaseFormData;
  step: LeaseFormStep;
  dirty: boolean;
  storageKey: string;
  leaseId: string | null;
  initialDraftId: string | null;
  initialVersion: number | null;
  baseVersion: number | null;
  onStale: (currentVersion: number) => void;
  onDraftCreated: (draftId: string) => void;
}

// Saves the form as a server draft a moment after the person stops typing (and at once on a step
// change), keeps a copy in this browser at every change, and retries with backoff when offline.
export function useAutosave(o: Options) {
  const [commit] = useMutation<useAutosaveSaveDraftMutation>(graphql`
    mutation useAutosaveSaveDraftMutation($input: SaveLeaseDraftInput!) {
      saveLeaseDraft(input: $input) {
        __typename
        ... on MutationSaveLeaseDraftSuccess { data { draft { id version updatedAt currentStep } } }
        ... on StaleVersion { currentVersion }
        ... on DomainError { message }
      }
    }
  `);
  const [status, setStatus] = useState<SaveStatus>(o.initialDraftId ? 'saved' : 'idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const draftId = useRef(o.initialDraftId);
  const version = useRef(o.initialVersion);
  const inflight = useRef(false);
  const pending = useRef(false);
  const attempt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(o);
  latest.current = o;
  const paused = useRef(false);

  const save = useCallback(() => {
    const cur = latest.current;
    if (!cur.enabled || paused.current) return;
    if (inflight.current) {
      pending.current = true;
      return;
    }
    inflight.current = true;
    setStatus((s) => (s === 'retrying' ? s : 'saving'));
    commit({
      variables: {
        input: {
          id: draftId.current,
          leaseId: draftId.current ? null : cur.leaseId,
          currentStep: cur.step,
          data: JSON.stringify(cur.data),
          version: version.current,
        },
      },
      onCompleted: (res) => {
        inflight.current = false;
        const r = res.saveLeaseDraft;
        const draft = r.__typename === 'MutationSaveLeaseDraftSuccess' ? r.data?.draft : undefined;
        if (draft) {
          const created = !draftId.current;
          draftId.current = draft.id;
          version.current = draft.version;
          attempt.current = 0;
          setSavedAt(new Date());
          setStatus('saved');
          writeLocal(latest.current.storageKey, { data: cur.data, step: cur.step, at: Date.now(), draftId: draftId.current, draftVersion: version.current, baseVersion: latest.current.baseVersion });
          if (created) latest.current.onDraftCreated(draft.id);
        } else if (r.__typename === 'StaleVersion' && r.currentVersion !== undefined) {
          paused.current = true;
          setStatus('local');
          latest.current.onStale(r.currentVersion);
        } else {
          // Quota or permission: the work stays in this browser and can still be submitted later.
          setStatus('local');
        }
        if (pending.current) {
          pending.current = false;
          save();
        }
      },
      onError: () => {
        inflight.current = false;
        setStatus('retrying');
        const wait = BACKOFF_MS[Math.min(attempt.current, BACKOFF_MS.length - 1)]!;
        attempt.current += 1;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(save, wait);
      },
    });
  }, [commit]);

  // Every change: keep a browser copy now, save to the server shortly.
  useEffect(() => {
    if (!o.enabled || !o.dirty) return;
    writeLocal(o.storageKey, { data: o.data, step: o.step, at: Date.now(), draftId: draftId.current, draftVersion: version.current, baseVersion: latest.current.baseVersion });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, DEBOUNCE_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [o.data, o.dirty, o.enabled, o.storageKey, o.step, save]);

  // Moving between steps saves straight away.
  const lastStep = useRef(o.step);
  useEffect(() => {
    if (lastStep.current !== o.step) {
      lastStep.current = o.step;
      if (o.dirty) save();
    }
  }, [o.step, o.dirty, save]);

  useEffect(() => {
    const online = () => { if (latest.current.dirty) save(); };
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [save]);

  return {
    status,
    savedAt,
    draftId: () => draftId.current,
    version: () => version.current,
    // After a conflict the person decides; keeping their version saves over the newer one.
    resume: (newVersion: number) => { version.current = newVersion; paused.current = false; save(); },
    pause: () => { paused.current = true; if (timer.current) clearTimeout(timer.current); },
  };
}
