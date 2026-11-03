import { useRef, useState, useTransition, type DragEvent } from 'react';
import { graphql, usePaginationFragment } from 'react-relay';
import { FormattedMessage, useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Alert from '@mui/material/Alert';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Drawer from '@mui/material/Drawer';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import { useTheme } from '@mui/material/styles';
import { Download, ExternalLink, FileText, Paperclip, X } from 'lucide-react';
import type { LeaseDocuments_lease$data, LeaseDocuments_lease$key } from './__generated__/LeaseDocuments_lease.graphql';
import type { LeaseDocumentsPaginationQuery } from './__generated__/LeaseDocumentsPaginationQuery.graphql';
import { EmptyNote } from '../../components/DefinitionList.tsx';
import { useFormat } from '../../i18n/format.ts';
import { useToast } from '../../shell/Toast.tsx';

type Doc = LeaseDocuments_lease$data['documents']['edges'][number]['node'];

// What can be attached: checked here for a quick answer, and again by the server from the file itself.
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx';
const ACCEPTED = /\.(pdf|png|jpe?g|webp|docx|xlsx)$/i;
const KINDS = ['LEASE', 'AMENDMENT', 'FLOOR_PLAN', 'PHOTO', 'CERTIFICATE', 'CORRESPONDENCE', 'OTHER'] as const;
const localId = (globalId: string) => { try { return atob(globalId).split(':')[1] ?? ''; } catch { return ''; } };

const sizeLabel = (bytes: number, f: ReturnType<typeof useFormat>) =>
  bytes >= 1_000_000 ? `${f.number(bytes / 1_000_000, { maxFractionDigits: 1 })} MB` : `${f.number(Math.max(1, Math.round(bytes / 1000)), { maxFractionDigits: 0 })} KB`;

export function LeaseDocuments({ lease: ref, canEdit = false }: { lease: LeaseDocuments_lease$key; canEdit?: boolean }) {
  const { data, loadNext, hasNext, isLoadingNext, refetch } = usePaginationFragment<LeaseDocumentsPaginationQuery, LeaseDocuments_lease$key>(
    graphql`
      fragment LeaseDocuments_lease on Lease
      @refetchable(queryName: "LeaseDocumentsPaginationQuery")
      @argumentDefinitions(first: { type: "Int", defaultValue: 20 }, after: { type: "String" }) {
        id
        documents(first: $first, after: $after) @connection(key: "LeaseDocuments_documents") {
          totalCount
          edges {
            node { id kind title filename mimeType sizeBytes url createdAt uploadedBy { displayName } }
          }
        }
      }
    `,
    ref,
  );
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState<Doc | null>(null);
  const f = useFormat();
  const intl = useIntl();
  const theme = useTheme();
  const t = theme.tokens;
  const docs = data.documents.edges.map((e) => e.node);
  const toast = useToast();
  const picker = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ file: File; kind: (typeof KINDS)[number]; title: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const m = (id: string, values?: Record<string, string>) => intl.formatMessage({ id }, values);

  const choose = (file: File | undefined) => {
    if (!file) return;
    setProblem(file.size > MAX_BYTES ? m('lease.documents.tooLarge') : !ACCEPTED.test(file.name) ? m('lease.documents.badType') : null);
    setPending({ file, kind: file.type.startsWith('image/') ? 'PHOTO' : 'OTHER', title: file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim() });
  };
  const attach = async () => {
    if (!pending || problem) return;
    setSending(true);
    try {
      const res = await fetch('/api/uploads', {
        method: 'POST', credentials: 'same-origin',
        headers: {
          'x-tenuro-client': 'web', 'content-type': 'application/octet-stream', 'x-lease-id': localId(data.id),
          'x-filename': encodeURIComponent(pending.file.name), 'x-title': encodeURIComponent(pending.title), 'x-document-kind': pending.kind,
        },
        body: pending.file,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setProblem(body?.message ?? m('lease.documents.failed'));
        return;
      }
      toast.show(m('lease.documents.attached', { name: pending.file.name }));
      setPending(null);
      refetch({}, { fetchPolicy: 'network-only' });
    } catch {
      setProblem(m('lease.documents.failed'));
    } finally {
      setSending(false);
    }
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDragging(false); if (canEdit) choose(e.dataTransfer.files[0]); };
  const dropTarget = canEdit ? {
    onDragOver: (e: DragEvent) => { e.preventDefault(); setDragging(true); },
    onDragLeave: () => setDragging(false),
    onDrop,
  } : {};

  const attachBar = canEdit && (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 3, flexWrap: 'wrap', mb: 3 }}>
      <Box sx={{ fontSize: '0.8125rem', color: t.inkSecondary }}><FormattedMessage id="lease.documents.dropHint" /></Box>
      <Button variant="outlined" startIcon={<Paperclip size={16} aria-hidden />} onClick={() => picker.current?.click()}><FormattedMessage id="lease.documents.attach" /></Button>
      <input ref={picker} type="file" accept={ACCEPT} hidden onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ''; }} />
    </Box>
  );
  const attachDialog = (
    <Dialog open={pending !== null} onClose={() => !sending && setPending(null)} aria-labelledby="attach-title" fullWidth maxWidth="xs">
      <DialogTitle id="attach-title"><FormattedMessage id="lease.documents.attachTitle" /></DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 4, pt: '8px !important' }}>
        {pending && (
          <Box sx={{ fontSize: '0.875rem', color: t.inkSecondary, overflowWrap: 'anywhere' }} data-num>
            {pending.file.name} · {sizeLabel(pending.file.size, f)}
          </Box>
        )}
        {problem && <Alert severity="error">{problem}</Alert>}
        <TextField select label={m('lease.documents.kind')} value={pending?.kind ?? 'OTHER'} onChange={(e) => pending && setPending({ ...pending, kind: e.target.value as (typeof KINDS)[number] })}>
          {KINDS.map((k) => <MenuItem key={k} value={k}>{m(`document.${k}`)}</MenuItem>)}
        </TextField>
        <TextField label={m('lease.documents.title')} value={pending?.title ?? ''} onChange={(e) => pending && setPending({ ...pending, title: e.target.value.slice(0, 160) })} />
      </DialogContent>
      <DialogActions sx={{ px: 6, pb: 5 }}>
        <Button onClick={() => setPending(null)} disabled={sending}><FormattedMessage id="common.cancel" /></Button>
        <Button variant="contained" onClick={() => void attach()} loading={sending} disabled={problem !== null}><FormattedMessage id="lease.documents.attachConfirm" /></Button>
      </DialogActions>
    </Dialog>
  );

  if (docs.length === 0) {
    return (
      <Box {...dropTarget} sx={{ outline: dragging ? `2px dashed ${t.brand}` : 'none', outlineOffset: 4, borderRadius: 1 }}>
        {attachBar}
        <EmptyNote><FormattedMessage id="lease.documents.none" /></EmptyNote>
        {attachDialog}
      </Box>
    );
  }

  return (
    <Box {...dropTarget} sx={{ outline: dragging ? `2px dashed ${t.brand}` : 'none', outlineOffset: 4, borderRadius: 1 }}>
      {attachBar}
      {attachDialog}
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, borderTop: `1px solid ${t.ruleStrong}` }}>
        {docs.map((d) => {
          const isImage = d.mimeType.startsWith('image/');
          const ext = (d.filename.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toUpperCase();
          // Images and the documents rendered from the lease (agreement as HTML, plan as SVG) preview here.
          const previewable = isImage || d.mimeType === 'text/html';
          const body = (
            <>
              {/* A thumbnail: the picture itself for images, otherwise the file's type. */}
              <Box sx={{ width: 40, height: 48, borderRadius: 0.75, border: `1px solid ${t.rule}`, backgroundColor: t.sunken, display: 'grid', placeItems: 'center', flexShrink: 0, overflow: 'hidden' }}>
                {isImage
                  ? <Box component="img" src={d.url} alt="" loading="lazy" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : (
                    <Box sx={{ display: 'grid', justifyItems: 'center', gap: 0.25 }}>
                      <FileText size={17} strokeWidth={1.5} aria-hidden color={t.inkSecondary} />
                      {ext && ext !== 'HTML' && <Box component="span" aria-hidden sx={{ fontSize: '0.5625rem', fontWeight: 700, letterSpacing: '0.04em', color: t.inkSecondary }}>{ext}</Box>}
                    </Box>
                  )}
              </Box>
              <Box sx={{ minWidth: 0, flex: 1, textAlign: 'start' }}>
                <Box sx={{ fontWeight: 500, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 2 }}>
                  {d.title}
                </Box>
                <Box sx={{ fontSize: '0.75rem', color: t.inkSecondary }} data-num>
                  {intl.formatMessage({ id: `document.${d.kind}` })} · {sizeLabel(d.sizeBytes, f)} · {f.date(d.createdAt.slice(0, 10))}
                  {d.uploadedBy && <> · <FormattedMessage id="lease.documents.uploadedBy" values={{ name: d.uploadedBy.displayName }} /></>}
                </Box>
              </Box>
            </>
          );
          return (
            <Box component="li" key={d.id} sx={{ borderBottom: `1px solid ${t.rule}` }}>
              {previewable ? (
                <ButtonBase
                  onClick={() => setOpen(d)}
                  // Named by its visible text (title, kind, size, date), as WCAG 2.5.3 asks.
                  sx={{ width: '100%', display: 'flex', gap: 4, py: 3, px: 2, borderRadius: 1, '&:hover': { backgroundColor: t.brandTint }, '&.Mui-focusVisible': { outline: `2px solid ${t.focus}` } }}
                >
                  {body}
                </ButtonBase>
              ) : (
                <Box sx={{ display: 'flex', gap: 4, py: 3, px: 2 }}>{body}</Box>
              )}
            </Box>
          );
        })}
      </Box>
      {hasNext && (
        <Button sx={{ mt: 4 }} variant="outlined" loading={isLoadingNext} onClick={() => startTransition(() => { loadNext(20); })}>
          <FormattedMessage id="common.loadMore" />
        </Button>
      )}
      <Drawer
        anchor={theme.direction === 'rtl' ? 'left' : 'right'}
        open={open !== null}
        onClose={() => setOpen(null)}
        slotProps={{ paper: { sx: { width: { xs: '100%', md: 760 } } } }}
      >
        {open && (
          <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 5, py: 3, borderBottom: `1px solid ${t.rule}` }}>
              <Box component="h2" sx={{ ...theme.typography.h4, m: 0, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{open.title}</Box>
              <IconButton component="a" href={open.url} target="_blank" rel="noopener" aria-label={intl.formatMessage({ id: 'lease.documents.openTab' })}><ExternalLink size={18} /></IconButton>
              <IconButton component="a" href={`${open.url}?download=1`} aria-label={intl.formatMessage({ id: 'lease.documents.download' })}><Download size={18} /></IconButton>
              <IconButton onClick={() => setOpen(null)} aria-label={intl.formatMessage({ id: 'common.close' })}><X size={18} /></IconButton>
            </Box>
            {open.mimeType === 'text/html' ? (
              // The rendered agreement in a sandboxed frame (the server also serves it with a sandbox CSP).
              <Box component="iframe" src={open.url} title={open.title} sandbox="" sx={{ flex: 1, width: '100%', border: 0, backgroundColor: t.sunken }} />
            ) : (
              <Box sx={{ flex: 1, overflow: 'auto', backgroundColor: t.sunken, p: 5, display: 'grid', placeItems: 'center' }}>
                <Box component="img" src={open.url} alt={open.title} sx={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 1, backgroundColor: '#fffdf8', boxShadow: '0 8px 24px -12px rgba(0,0,0,0.4)' }} />
              </Box>
            )}
          </Box>
        )}
      </Drawer>
    </Box>
  );
}
