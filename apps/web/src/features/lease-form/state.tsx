import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from 'react';
import { useIntl, type IntlShape } from 'react-intl';
import { LEASE_FORM_STEPS, validateLease, type Issue, type LeaseFormData, type LeaseFormStep } from '@tenuro/lease-rules';
import { makeFormatters } from '../../i18n/format.ts';
import { getAt, setAt, stepOfPath, type Path } from './model.ts';

export interface ServerIssue {
  path: string;
  code: string;
  message: string;
  step: LeaseFormStep;
}

export interface FormState {
  data: LeaseFormData;
  step: LeaseFormStep;
  visited: ReadonlySet<LeaseFormStep>;
  attempted: ReadonlySet<LeaseFormStep>;
  touched: ReadonlySet<Path>;
  server: readonly ServerIssue[];
  dirty: boolean;
}

type Action =
  | { type: 'set'; path: Path; value: unknown }
  | { type: 'touch'; path: Path }
  | { type: 'goto'; step: LeaseFormStep }
  | { type: 'attempt'; steps: readonly LeaseFormStep[] }
  | { type: 'replace'; data: LeaseFormData; dirty?: boolean }
  | { type: 'server'; issues: ServerIssue[] };

const addTo = <T,>(set: ReadonlySet<T>, ...items: T[]) => {
  const next = new Set(set);
  for (const i of items) next.add(i);
  return next;
};

function reducer(state: FormState, action: Action): FormState {
  switch (action.type) {
    case 'set':
      return {
        ...state,
        data: setAt(state.data, action.path, action.value),
        dirty: true,
        // A server complaint about a field is stale once the person edits that field.
        server: state.server.filter((s) => s.path !== action.path && !s.path.startsWith(`${action.path}.`)),
      };
    case 'touch':
      return state.touched.has(action.path) ? state : { ...state, touched: addTo(state.touched, action.path) };
    case 'goto':
      return { ...state, step: action.step, visited: addTo(state.visited, action.step) };
    case 'attempt':
      return { ...state, attempted: addTo(state.attempted, ...action.steps), visited: addTo(state.visited, ...action.steps) };
    case 'replace':
      return { ...state, data: action.data, dirty: action.dirty ?? false, server: [] };
    case 'server':
      return {
        ...state, server: action.issues,
        attempted: addTo(state.attempted, ...action.issues.map((i) => i.step)),
        visited: addTo(state.visited, ...action.issues.map((i) => i.step)),
      };
  }
}

export function initialState(data: LeaseFormData, step: LeaseFormStep, mode: 'new' | 'amend' | 'resume'): FormState {
  const upTo = LEASE_FORM_STEPS.slice(0, LEASE_FORM_STEPS.indexOf(step) + 1);
  return {
    data, step,
    // An amendment starts complete, and a resumed draft has been through its earlier steps.
    visited: new Set(mode === 'amend' ? LEASE_FORM_STEPS : upTo),
    attempted: new Set(mode === 'amend' ? [] : upTo.slice(0, -1)),
    touched: new Set(),
    server: [],
    dirty: false,
  };
}

export function translateIssue(intl: IntlShape, issue: { code: string; params?: Record<string, string | number> | undefined; message?: string }): string {
  const id = `issue.${issue.code}`;
  if (!intl.messages[id]) return issue.message ?? intl.formatMessage({ id: 'issue.unknown' });
  const f = makeFormatters(intl.locale);
  const params: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(issue.params ?? {})) {
    params[k] = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? f.date(v) : typeof v === 'number' ? intl.formatNumber(v) : v;
  }
  return intl.formatMessage({ id }, params);
}

export interface ShownIssue {
  path: Path;
  step: LeaseFormStep;
  message: string;
}

interface FormApi {
  state: FormState;
  dispatch: (a: Action) => void;
  set: (path: Path, value: unknown) => void;
  touch: (path: Path) => void;
  value: <T = string>(path: Path) => T;
  errorFor: (path: Path) => string | undefined;
  shownIssues: (step: LeaseFormStep | 'all') => ShownIssue[];
  issueCount: (step: LeaseFormStep) => number;
  readOnly: boolean;
}

const Ctx = createContext<FormApi | null>(null);

export function useFormReducer(init: () => FormState) {
  return useReducer(reducer, undefined, init);
}

export function FormProvider({ state, dispatch, readOnly = false, children }: { state: FormState; dispatch: (a: Action) => void; readOnly?: boolean; children: ReactNode }) {
  const intl = useIntl();
  const all = useMemo(() => validateLease(state.data), [state.data]);

  const visible = useCallback((i: Issue | ServerIssue, step: LeaseFormStep | 'all') => {
    if (step === 'all' || step === 'review') return true;
    return state.attempted.has(i.step) || state.touched.has(i.path) || [...state.touched].some((t) => i.path.startsWith(`${t}.`));
  }, [state.attempted, state.touched]);

  const shownIssues = useCallback((step: LeaseFormStep | 'all'): ShownIssue[] => {
    const local = all.filter((i) => (step === 'all' || step === 'review' || i.step === step) && visible(i, step));
    const server = state.server.filter((s) => (step === 'all' || step === 'review' || s.step === step) && !local.some((l) => l.path === s.path));
    return [
      ...local.map((i) => ({ path: i.path, step: i.step, message: translateIssue(intl, i) })),
      ...server.map((s) => ({ path: s.path, step: s.step, message: translateIssue(intl, { code: s.code, message: s.message }) })),
    ];
  }, [all, state.server, visible, intl]);

  const api = useMemo<FormApi>(() => {
    const errors = new Map<string, string>();
    for (const i of shownIssues(state.step)) if (!errors.has(i.path)) errors.set(i.path, i.message);
    return {
      state,
      dispatch,
      set: (path, value) => dispatch({ type: 'set', path, value }),
      touch: (path) => dispatch({ type: 'touch', path }),
      value: <T,>(path: Path) => getAt(state.data, path) as T,
      errorFor: (path) => errors.get(path),
      shownIssues,
      issueCount: (step) => all.filter((i) => i.step === step).length + state.server.filter((s) => s.step === step).length,
      readOnly,
    };
  }, [state, dispatch, shownIssues, all, readOnly]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useForm(): FormApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useForm outside FormProvider');
  return ctx;
}

export const serverIssuesFrom = (errors: readonly { path: string; code: string; message: string; step: string | null }[]): ServerIssue[] =>
  errors.map((e) => ({ path: e.path, code: e.code, message: e.message, step: (LEASE_FORM_STEPS as readonly string[]).includes(e.step ?? '') ? (e.step as LeaseFormStep) : stepOfPath(e.path) }));
