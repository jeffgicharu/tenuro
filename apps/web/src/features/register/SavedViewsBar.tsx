import { useLayoutEffect, useRef, useState } from 'react';
import { graphql, useFragment, useMutation } from 'react-relay';
import { FormattedMessage, useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import { useTheme } from '@mui/material/styles';
import { Bookmark, BookmarkPlus, X } from 'lucide-react';
import type { SavedViewsBar_viewer$key } from './__generated__/SavedViewsBar_viewer.graphql';
import type { SavedViewsBarSaveMutation } from './__generated__/SavedViewsBarSaveMutation.graphql';
import type { SavedViewsBarDeleteMutation } from './__generated__/SavedViewsBarDeleteMutation.graphql';
import { useToast } from '../../shell/Toast.tsx';
import type { ViewConfig } from './urlState.ts';

interface Props {
  viewer: SavedViewsBar_viewer$key;
  activeViewId: string | null;
  onSelect(view: { id: string; config: string } | null): void;
  currentConfig(): ViewConfig;
  onSaved(viewId: string): void;
}

export function SavedViewsBar({ viewer: ref, activeViewId, onSelect, currentConfig, onSaved }: Props) {
  const viewer = useFragment(
    graphql`
      fragment SavedViewsBar_viewer on Viewer {
        isAdmin
        tenant { name nameLocal }
        savedViews(first: 50, scope: LEASE_REGISTER) @connection(key: "SavedViewsBar_savedViews", filters: ["scope"]) {
          __id
          edges { node { id name shared config } }
        }
      }
    `,
    ref,
  );
  const intl = useIntl();
  const theme = useTheme();
  const t = theme.tokens;
  const toast = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const connections = [viewer.savedViews.__id];

  const [commitSave, saving] = useMutation<SavedViewsBarSaveMutation>(graphql`
    mutation SavedViewsBarSaveMutation($input: SaveViewInput!, $connections: [ID!]!) {
      saveView(input: $input) {
        __typename
        ... on MutationSaveViewSuccess {
          data {
            view @appendNode(connections: $connections, edgeTypeName: "ViewerSavedViewsConnectionEdge") { id name shared config }
          }
        }
        ... on ValidationFailed { message fieldErrors { path message } }
        ... on DomainError { message }
      }
    }
  `);
  const [commitDelete] = useMutation<SavedViewsBarDeleteMutation>(graphql`
    mutation SavedViewsBarDeleteMutation($input: DeleteViewInput!, $connections: [ID!]!) {
      deleteView(input: $input) {
        __typename
        ... on MutationDeleteViewSuccess { data { deletedViewId @deleteEdge(connections: $connections) } }
        ... on DomainError { message }
      }
    }
  `);

  const errorMessage = (typename: string, fallback?: string) =>
    typename === 'PermissionDenied' ? intl.formatMessage({ id: 'common.permissionDenied' })
      : typename === 'QuotaExceeded' ? intl.formatMessage({ id: 'common.quota' })
        : fallback ?? intl.formatMessage({ id: 'common.error' });

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(intl.formatMessage({ id: 'register.views.nameRequired' }));
      return;
    }
    const config = JSON.stringify(currentConfig());
    const isShared = viewer.isAdmin && shared;
    commitSave({
      variables: { input: { scope: 'LEASE_REGISTER', name: trimmed, config, shared: isShared }, connections },
      optimisticResponse: {
        saveView: { __typename: 'MutationSaveViewSuccess', data: { view: { id: `client:new-view:${Date.now()}`, name: trimmed, shared: isShared, config } } },
      },
      onCompleted: (res) => {
        const r = res.saveView;
        if (r.__typename === 'MutationSaveViewSuccess' && r.data) {
          setDialogOpen(false);
          setName('');
          setShared(false);
          toast.show(intl.formatMessage({ id: 'register.views.saved' }));
          onSaved(r.data.view.id);
        } else if (r.__typename === 'ValidationFailed') {
          setNameError(r.fieldErrors?.[0]?.message ?? r.message ?? intl.formatMessage({ id: 'common.error' }));
        } else {
          setDialogOpen(false);
          toast.show(errorMessage(r.__typename, 'message' in r ? r.message : undefined), 'error');
        }
      },
      onError: () => toast.show(intl.formatMessage({ id: 'common.error' }), 'error'),
    });
  };

  const remove = (id: string) => {
    if (activeViewId === id) onSelect(null);
    commitDelete({
      variables: { input: { id }, connections },
      optimisticResponse: { deleteView: { __typename: 'MutationDeleteViewSuccess', data: { deletedViewId: id } } },
      onCompleted: (res) => {
        if (res.deleteView.__typename === 'MutationDeleteViewSuccess') toast.show(intl.formatMessage({ id: 'register.views.deleted' }));
        else toast.show(errorMessage(res.deleteView.__typename, 'message' in res.deleteView ? res.deleteView.message : undefined), 'error');
      },
      onError: () => toast.show(intl.formatMessage({ id: 'common.error' }), 'error'),
    });
  };

  const tab = (id: string | null, label: string, opts: { shared?: boolean; deletable?: boolean; config?: string } = {}) => {
    const active = activeViewId === id;
    return (
      <Box key={id ?? 'all'} role="presentation" sx={{ display: 'flex', alignItems: 'center', position: 'relative', flexShrink: 0 }}>
        <ButtonBase
          role="tab"
          aria-selected={active}
          data-active={active || undefined}
          onClick={() => onSelect(id && opts.config !== undefined ? { id, config: opts.config } : null)}
          sx={{
            gap: 1.5, px: 1, py: 2.5, fontSize: '0.875rem', fontWeight: active ? 600 : 500, whiteSpace: 'nowrap',
            color: active ? t.ink : t.inkSecondary, transition: 'color 120ms ease',
            '&:hover': { color: t.ink }, '&.Mui-focusVisible': { outline: `2px solid ${t.focus}`, outlineOffset: 2, borderRadius: 0.5 },
          }}
        >
          {id && (
            // Every saved view carries a bookmark; a shared one says so on hover and to screen readers.
            opts.shared ? (
              <Tooltip title={intl.formatMessage({ id: 'register.views.shared' })}>
                <Box component="span" sx={{ display: 'inline-flex', color: t.inkTertiary }}>
                  <Bookmark size={14} strokeWidth={1.8} fill="currentColor" aria-label={intl.formatMessage({ id: 'register.views.shared' })} />
                </Box>
              </Tooltip>
            ) : (
              <Box component="span" sx={{ display: 'inline-flex', color: t.inkTertiary }}><Bookmark size={14} strokeWidth={1.8} aria-hidden /></Box>
            )
          )}
          {label}
        </ButtonBase>
        {opts.deletable && active && id && (
          <IconButton size="small" onClick={() => remove(id)} aria-label={intl.formatMessage({ id: 'register.views.delete' }, { name: label })} sx={{ ml: 0.5, width: 24, height: 24 }}>
            <X size={13} strokeWidth={2} />
          </IconButton>
        )}
      </Box>
    );
  };

  const company = intl.locale.startsWith('ar') && viewer.tenant.nameLocal ? viewer.tenant.nameLocal : viewer.tenant.name;

  // One indicator slides under the active tab, and the row fades at whichever edge has more tabs.
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  const [fade, setFade] = useState({ start: false, end: false });
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const tab = list.querySelector<HTMLElement>('[data-active]');
      setIndicator(tab ? { left: tab.offsetLeft, width: tab.offsetWidth } : null);
      const max = list.scrollWidth - list.clientWidth;
      const x = Math.abs(list.scrollLeft);
      setFade({ start: x > 1, end: max > 1 && x < max - 1 });
    };
    measure();
    list.querySelector<HTMLElement>('[data-active]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    list.addEventListener('scroll', measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => { list.removeEventListener('scroll', measure); ro.disconnect(); };
  }, [activeViewId, viewer.savedViews.edges.length, intl.locale]);
  const endSide = theme.direction === 'rtl' ? 'left' : 'right';
  const mask = `linear-gradient(to ${endSide}, ${fade.start ? 'transparent 0, #000 24px' : '#000 0'}, ${fade.end ? '#000 calc(100% - 32px), transparent 100%' : '#000 100%'})`;

  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 4, borderBottom: `1px solid ${t.rule}` }}>
      <Box
        ref={listRef}
        role="tablist"
        aria-label={intl.formatMessage({ id: 'register.views.label' })}
        sx={{
          display: 'flex', gap: 5, overflowX: 'auto', flex: 1, minWidth: 0, scrollbarWidth: 'none', position: 'relative',
          '&::-webkit-scrollbar': { display: 'none' }, maskImage: mask, WebkitMaskImage: mask,
        }}
      >
        {indicator && (
          <Box
            aria-hidden
            sx={{
              // offsetLeft and a physical left: 0 share one coordinate space in either direction.
              position: 'absolute', bottom: 0, left: 0, height: 2, backgroundColor: t.ink, borderRadius: 1,
              width: indicator.width,
              transform: `translateX(${indicator.left}px)`,
              transition: 'transform 220ms cubic-bezier(0.2, 0, 0, 1), width 220ms cubic-bezier(0.2, 0, 0, 1)',
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            }}
          />
        )}
        {tab(null, intl.formatMessage({ id: 'register.views.all' }))}
        {viewer.savedViews.edges.map(({ node }) => tab(node.id, node.name, { shared: node.shared, deletable: !node.shared || viewer.isAdmin, config: node.config }))}
      </Box>
      <Button
        size="small"
        variant="text"
        startIcon={<BookmarkPlus size={15} strokeWidth={1.8} />}
        onClick={() => { setNameError(null); setDialogOpen(true); }}
        sx={{ mb: 1, flexShrink: 0 }}
      >
        <FormattedMessage id="register.views.save" />
      </Button>
      <Dialog open={dialogOpen} onClose={() => !saving && setDialogOpen(false)} aria-labelledby="save-view-title" maxWidth="xs" fullWidth>
        <Box component="form" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <DialogTitle id="save-view-title" sx={{ fontFamily: (theme) => theme.typography.h3.fontFamily }}>
            <FormattedMessage id="register.views.saveTitle" />
          </DialogTitle>
          <DialogContent>
            <DialogContentText sx={{ mb: 4 }}><FormattedMessage id="register.views.saveBody" /></DialogContentText>
            <TextField
              autoFocus
              fullWidth
              label={intl.formatMessage({ id: 'register.views.name' })}
              value={name}
              onChange={(e) => { setName(e.target.value); setNameError(null); }}
              error={nameError !== null}
              helperText={nameError ?? ' '}
              slotProps={{ htmlInput: { maxLength: 60 } }}
            />
            {viewer.isAdmin && (
              <FormControlLabel
                control={<Checkbox checked={shared} onChange={(e) => setShared(e.target.checked)} />}
                label={intl.formatMessage({ id: 'register.views.share' }, { company })}
              />
            )}
          </DialogContent>
          <DialogActions sx={{ px: 6, pb: 5 }}>
            <Button onClick={() => setDialogOpen(false)} disabled={saving}><FormattedMessage id="common.cancel" /></Button>
            <Button type="submit" variant="contained" loading={saving}><FormattedMessage id="common.save" /></Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  );
}
