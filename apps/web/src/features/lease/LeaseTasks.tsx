import { useState, useTransition } from 'react';
import { graphql, useFragment, useMutation, usePaginationFragment } from 'react-relay';
import { FormattedMessage, useIntl } from 'react-intl';
import dayjs from 'dayjs';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { useTheme } from '@mui/material/styles';
import { ListPlus } from 'lucide-react';
import type { LeaseTasks_lease$key } from './__generated__/LeaseTasks_lease.graphql';
import type { LeaseTasksPaginationQuery } from './__generated__/LeaseTasksPaginationQuery.graphql';
import type { LeaseTasksRow_task$key } from './__generated__/LeaseTasksRow_task.graphql';
import type { LeaseTasksUpdateMutation } from './__generated__/LeaseTasksUpdateMutation.graphql';
import type { LeaseTasksCreateMutation } from './__generated__/LeaseTasksCreateMutation.graphql';
import { EmptyNote } from '../../components/DefinitionList.tsx';
import { Initials } from '../../components/Initials.tsx';
import { useFormat } from '../../i18n/format.ts';
import { useToast } from '../../shell/Toast.tsx';

const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;

function errorMessageId(typename: string): string {
  if (typename === 'PermissionDenied') return 'common.permissionDenied';
  if (typename === 'StaleVersion') return 'common.stale';
  if (typename === 'QuotaExceeded') return 'common.quota';
  return 'common.error';
}

function TaskRow({ task: ref, canEdit }: { task: LeaseTasksRow_task$key; canEdit: boolean }) {
  const task = useFragment(
    graphql`
      fragment LeaseTasksRow_task on Task {
        id title status priority dueOn isOverdue version
        assignee { displayName initials }
      }
    `,
    ref,
  );
  const intl = useIntl();
  const f = useFormat();
  const t = useTheme().tokens;
  const toast = useToast();
  const [commit] = useMutation<LeaseTasksUpdateMutation>(graphql`
    mutation LeaseTasksUpdateMutation($input: UpdateTaskInput!) {
      updateTask(input: $input) {
        __typename
        ... on MutationUpdateTaskSuccess {
          data { task { id status version isOverdue completedAt lease { id ...LeaseRail_lease } } }
        }
        ... on DomainError { message }
      }
    }
  `);
  const done = task.status === 'DONE';

  const toggle = () => {
    const status = done ? 'TODO' : 'DONE';
    commit({
      variables: { input: { id: task.id, version: task.version, status } },
      optimisticUpdater: (store) => {
        const record = store.get(task.id);
        record?.setValue(status, 'status');
        record?.setValue(false, 'isOverdue');
      },
      onCompleted: (res) => {
        if (res.updateTask.__typename !== 'MutationUpdateTaskSuccess') {
          toast.show(intl.formatMessage({ id: errorMessageId(res.updateTask.__typename) }), 'error');
        }
      },
      onError: () => toast.show(intl.formatMessage({ id: 'common.error' }), 'error'),
    });
  };

  return (
    <Box component="li" sx={{ display: 'flex', alignItems: 'flex-start', gap: 3, py: 2.5, borderBottom: `1px solid ${t.rule}` }}>
      <Checkbox
        checked={done}
        onChange={toggle}
        disabled={!canEdit}
        slotProps={{ input: { 'aria-label': intl.formatMessage({ id: done ? 'lease.tasks.markOpen' : 'lease.tasks.markDone' }, { title: task.title }) } }}
        sx={{ mt: -1, p: 1.5 }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ fontSize: '0.875rem', fontWeight: 500, color: done ? t.inkSecondary : t.ink, textDecoration: done ? 'line-through' : 'none', textDecorationColor: t.inkTertiary }}>
          {task.title}
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, fontSize: '0.75rem', color: t.inkSecondary, mt: 0.5 }} data-num>
          {task.isOverdue && <Box component="span" sx={{ color: t.danger, fontWeight: 600 }}><FormattedMessage id="lease.tasks.overdue" /></Box>}
          <span>{task.dueOn ? <FormattedMessage id="lease.tasks.due" values={{ date: f.date(task.dueOn) }} /> : <FormattedMessage id="lease.tasks.noDue" />}</span>
          {(task.priority === 'HIGH' || task.priority === 'URGENT') && (
            <Box component="span" sx={{ color: task.priority === 'URGENT' ? t.danger : t.warning, fontWeight: 600 }}>
              <FormattedMessage id={`task.priority.${task.priority}`} />
            </Box>
          )}
        </Box>
      </Box>
      {task.assignee ? <Initials text={task.assignee.initials} size={28} title={task.assignee.displayName} /> : (
        <Box sx={{ fontSize: '0.75rem', color: t.inkTertiary }}><FormattedMessage id="lease.tasks.unassigned" /></Box>
      )}
    </Box>
  );
}

export function LeaseTasks({ lease: ref, canEdit }: { lease: LeaseTasks_lease$key; canEdit: boolean }) {
  const { data, loadNext, hasNext, isLoadingNext, refetch } = usePaginationFragment<LeaseTasksPaginationQuery, LeaseTasks_lease$key>(
    graphql`
      fragment LeaseTasks_lease on Lease
      @refetchable(queryName: "LeaseTasksPaginationQuery")
      @argumentDefinitions(first: { type: "Int", defaultValue: 20 }, after: { type: "String" }, includeDone: { type: "Boolean", defaultValue: false }) {
        id
        assignableUsers { id displayName }
        tasks(first: $first, after: $after, includeDone: $includeDone) @connection(key: "LeaseTasks_tasks", filters: ["includeDone"]) {
          __id
          totalCount
          edges { node { id ...LeaseTasksRow_task } }
        }
      }
    `,
    ref,
  );
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const t = useTheme().tokens;
  const rows = data.tasks.edges;

  return (
    <Box sx={{ opacity: pending ? 0.6 : 1, transition: 'opacity 120ms ease' }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 3, mb: 3 }}>
        <FormControlLabel
          control={<Switch size="small" onChange={(e) => startTransition(() => { refetch({ includeDone: e.target.checked }, { fetchPolicy: 'store-or-network' }); })} />}
          label={<Box component="span" sx={{ fontSize: '0.8125rem' }}><FormattedMessage id="lease.tasks.showDone" /></Box>}
        />
        {canEdit && (
          <Button variant="outlined" size="small" startIcon={<ListPlus size={15} />} onClick={() => setAdding(true)}>
            <FormattedMessage id="lease.addTask" />
          </Button>
        )}
      </Box>
      {rows.length === 0 ? <EmptyNote><FormattedMessage id="lease.tasks.none" /></EmptyNote> : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, borderTop: `1px solid ${t.ruleStrong}` }}>
          {rows.map((e) => <TaskRow key={e.node.id} task={e.node} canEdit={canEdit} />)}
        </Box>
      )}
      {hasNext && (
        <Button sx={{ mt: 4 }} variant="outlined" loading={isLoadingNext} onClick={() => startTransition(() => { loadNext(20); })}>
          <FormattedMessage id="common.loadMore" />
        </Button>
      )}
      {adding && (
        <NewTaskDialog leaseId={data.id} connectionId={data.tasks.__id} users={data.assignableUsers} onClose={() => setAdding(false)} />
      )}
    </Box>
  );
}

function NewTaskDialog({ leaseId, connectionId, users, onClose }: {
  leaseId: string; connectionId: string; users: readonly { id: string; displayName: string }[]; onClose: () => void;
}) {
  const intl = useIntl();
  const theme = useTheme();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueOn, setDueOn] = useState<string | null>(null);
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>('NORMAL');
  const [error, setError] = useState<string | null>(null);
  const [commit, saving] = useMutation<LeaseTasksCreateMutation>(graphql`
    mutation LeaseTasksCreateMutation($input: CreateTaskInput!, $connections: [ID!]!) {
      createTask(input: $input) {
        __typename
        ... on MutationCreateTaskSuccess {
          # Returning the rail's fragment keeps its open-task count current without a reload.
          data { task @appendNode(connections: $connections, edgeTypeName: "LeaseTasksConnectionEdge") { id ...LeaseTasksRow_task lease { id ...LeaseRail_lease } } }
        }
        ... on ValidationFailed { fieldErrors { path message } }
        ... on DomainError { message }
      }
    }
  `);

  const submit = () => {
    if (!title.trim()) {
      setError(intl.formatMessage({ id: 'lease.tasks.new.titleField' }));
      return;
    }
    commit({
      variables: {
        connections: [connectionId],
        input: { leaseId, title: title.trim(), priority, ...(assigneeId ? { assigneeId } : {}), ...(dueOn ? { dueOn } : {}) },
      },
      onCompleted: (res) => {
        const r = res.createTask;
        if (r.__typename === 'MutationCreateTaskSuccess') {
          toast.show(intl.formatMessage({ id: 'lease.tasks.created' }));
          onClose();
        } else if (r.__typename === 'ValidationFailed') {
          setError(r.fieldErrors?.[0]?.message ?? intl.formatMessage({ id: 'common.error' }));
        } else {
          setError(intl.formatMessage({ id: errorMessageId(r.__typename) }));
        }
      },
      onError: () => setError(intl.formatMessage({ id: 'common.error' })),
    });
  };

  return (
    <Dialog open onClose={() => !saving && onClose()} aria-labelledby="new-task-title" fullWidth maxWidth="sm">
      <DialogTitle id="new-task-title" sx={{ fontFamily: theme.typography.h3.fontFamily }}><FormattedMessage id="lease.tasks.new.title" /></DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 5, pt: '8px !important' }}>
        <TextField
          autoFocus
          label={intl.formatMessage({ id: 'lease.tasks.new.titleField' })}
          value={title}
          onChange={(e) => { setTitle(e.target.value); setError(null); }}
          error={error !== null}
          helperText={error ?? ' '}
          slotProps={{ htmlInput: { maxLength: 200 } }}
          fullWidth
        />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 4 }}>
          <TextField select label={intl.formatMessage({ id: 'lease.tasks.new.assignee' })} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <MenuItem value=""><FormattedMessage id="lease.tasks.unassigned" /></MenuItem>
            {users.map((u) => <MenuItem key={u.id} value={u.id}>{u.displayName}</MenuItem>)}
          </TextField>
          <DatePicker
            label={intl.formatMessage({ id: 'lease.tasks.new.due' })}
            value={dueOn ? dayjs(dueOn) : null}
            onChange={(v) => setDueOn(v && v.isValid() ? v.format('YYYY-MM-DD') : null)}
            slotProps={{ textField: { size: 'small' } }}
          />
          <TextField select label={intl.formatMessage({ id: 'lease.tasks.new.priority' })} value={priority} onChange={(e) => setPriority(e.target.value as (typeof PRIORITIES)[number])}>
            {PRIORITIES.map((p) => <MenuItem key={p} value={p}><FormattedMessage id={`task.priority.${p}`} /></MenuItem>)}
          </TextField>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 6, pb: 5 }}>
        <Button onClick={onClose} disabled={saving}><FormattedMessage id="common.cancel" /></Button>
        <Button variant="contained" onClick={submit} loading={saving}><FormattedMessage id="lease.tasks.new.create" /></Button>
      </DialogActions>
    </Dialog>
  );
}
