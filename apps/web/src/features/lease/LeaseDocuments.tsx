import { useState, useTransition } from 'react';
import { graphql, usePaginationFragment } from 'react-relay';
import { FormattedMessage, useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import { useTheme } from '@mui/material/styles';
import { Download, ExternalLink, FileText, Image as ImageIcon, X } from 'lucide-react';
import type { LeaseDocuments_lease$data, LeaseDocuments_lease$key } from './__generated__/LeaseDocuments_lease.graphql';
import type { LeaseDocumentsPaginationQuery } from './__generated__/LeaseDocumentsPaginationQuery.graphql';
import { EmptyNote } from '../../components/DefinitionList.tsx';
import { useFormat } from '../../i18n/format.ts';

type Doc = LeaseDocuments_lease$data['documents']['edges'][number]['node'];

const sizeLabel = (bytes: number, f: ReturnType<typeof useFormat>) =>
  bytes >= 1_000_000 ? `${f.number(bytes / 1_000_000, { maxFractionDigits: 1 })} MB` : `${f.number(Math.max(1, Math.round(bytes / 1000)), { maxFractionDigits: 0 })} KB`;

export function LeaseDocuments({ lease: ref }: { lease: LeaseDocuments_lease$key }) {
  const { data, loadNext, hasNext, isLoadingNext } = usePaginationFragment<LeaseDocumentsPaginationQuery, LeaseDocuments_lease$key>(
    graphql`
      fragment LeaseDocuments_lease on Lease
      @refetchable(queryName: "LeaseDocumentsPaginationQuery")
      @argumentDefinitions(first: { type: "Int", defaultValue: 20 }, after: { type: "String" }) {
        documents(first: $first, after: $after) @connection(key: "LeaseDocuments_documents") {
          totalCount
          edges {
            node { id kind title filename mimeType sizeBytes url generated createdAt uploadedBy { displayName } }
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

  if (docs.length === 0) return <EmptyNote><FormattedMessage id="lease.documents.none" /></EmptyNote>;

  return (
    <Box>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, borderTop: `1px solid ${t.ruleStrong}` }}>
        {docs.map((d) => {
          const isImage = d.mimeType.startsWith('image/');
          const Icon = isImage ? ImageIcon : FileText;
          // Images and the documents rendered from the lease (agreement as HTML, plan as SVG) preview here.
          const previewable = isImage || d.mimeType === 'text/html';
          const body = (
            <>
              <Box sx={{ width: 36, height: 44, borderRadius: 0.75, border: `1px solid ${t.rule}`, backgroundColor: t.sunken, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Icon size={18} strokeWidth={1.5} aria-hidden color={t.inkSecondary} />
              </Box>
              <Box sx={{ minWidth: 0, flex: 1, textAlign: 'start' }}>
                <Box sx={{ fontWeight: 500, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 2 }}>
                  {d.title}
                  {d.generated && (
                    <Box component="span" sx={{ fontSize: '0.6875rem', fontWeight: 600, color: t.inkSecondary, border: `1px solid ${t.ruleStrong}`, borderRadius: 0.5, px: 1, lineHeight: '16px' }}>
                      <FormattedMessage id="lease.documents.template" />
                    </Box>
                  )}
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
