import { graphql, useFragment } from 'react-relay';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import { BellRing } from 'lucide-react';
import type { KeyDateReminders_viewer$key } from './__generated__/KeyDateReminders_viewer.graphql';
import { useFormat } from '../../i18n/format.ts';
import { FONT_MONO } from '../../theme/theme.ts';

// Reminders falling due this week on dates the signed-in person owns: the nudge before the deadline.
export function KeyDateReminders({ viewer: ref }: { viewer: KeyDateReminders_viewer$key }) {
  const data = useFragment(
    graphql`
      fragment KeyDateReminders_viewer on Viewer {
        remindersDue(withinDays: 7, first: 12) {
          remindOn daysBefore
          keyDate { id kind dueOn lease { id reference } }
        }
      }
    `,
    ref,
  );
  const t = useTheme().tokens;
  const f = useFormat();
  const intl = useIntl();
  return (
    <Box component="aside" aria-labelledby="reminders-panel" sx={{ border: `1px solid ${t.rule}`, borderRadius: 1.5, backgroundColor: t.surface, p: 4 }}>
      <Box component="h2" id="reminders-panel" sx={{ m: 0, mb: 1, fontSize: '0.9375rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <BellRing size={16} aria-hidden style={{ color: t.warning }} />
        <FormattedMessage id="keyDates.remindersTitle" />
      </Box>
      <Box sx={{ fontSize: '0.75rem', color: t.inkSecondary, mb: 3 }}><FormattedMessage id="keyDates.remindersLede" /></Box>
      {data.remindersDue.length === 0 ? (
        <Box sx={{ fontSize: '0.8125rem', color: t.inkSecondary }}><FormattedMessage id="keyDates.noReminders" /></Box>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 2.5 }}>
          {data.remindersDue.map((r) => (
            <Box component="li" key={`${r.keyDate.id}-${r.daysBefore}`} sx={{ fontSize: '0.8125rem', borderInlineStart: `2px solid ${t.warning}`, paddingInlineStart: 2 }}>
              <Box sx={{ fontWeight: 600 }}><FormattedMessage id={`keyDate.${r.keyDate.kind}`} /></Box>
              <Box sx={{ color: t.inkSecondary }} data-num>
                <Box component={RouterLink} to={`/leases/${encodeURIComponent(r.keyDate.lease.id)}`} sx={{ fontFamily: FONT_MONO, color: t.brand, textDecoration: 'none', direction: 'ltr', unicodeBidi: 'isolate' }}>{r.keyDate.lease.reference}</Box>
                {' · '}{intl.formatMessage({ id: 'keyDates.reminderLine' }, { remind: f.relativeDays(daysFrom(r.remindOn)), due: f.date(r.keyDate.dueOn) })}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

const daysFrom = (iso: string) => Math.round((Date.parse(iso) - Date.parse(new Date().toISOString().slice(0, 10))) / 86_400_000);
