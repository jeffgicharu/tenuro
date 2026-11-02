import { Suspense, useEffect, useMemo, useRef, useState, useTransition, type UIEvent } from 'react';
import { graphql, useLazyLoadQuery, usePaginationFragment } from 'react-relay';
import { useIntl } from 'react-intl';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import TextField from '@mui/material/TextField';
import { useTheme } from '@mui/material/styles';
import { Building2 } from 'lucide-react';
import type { PropertyPicker_viewer$key } from './__generated__/PropertyPicker_viewer.graphql';
import type { PropertyPickerSelectedQuery } from './__generated__/PropertyPickerSelectedQuery.graphql';

export interface PropertyOption {
  id: string;
  name: string;
  code: string;
  city: string;
  district: string | null | undefined;
  type: string;
  countryCode: string;
}

export interface PropertyPickerProps {
  viewer: PropertyPicker_viewer$key;
  value: string | null;
  onChange: (id: string | null, option: PropertyOption | null) => void;
  onBlur?: () => void;
  id: string;
  label: string;
  error?: string | undefined;
  helperText?: string | undefined;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}

// Searches the portfolio on the server as the person types; results page in as the list scrolls.
export function PropertyPicker(props: PropertyPickerProps) {
  const { data, refetch, loadNext, hasNext, isLoadingNext } = usePaginationFragment(
    graphql`
      fragment PropertyPicker_viewer on Viewer
      @refetchable(queryName: "PropertyPickerRefetchQuery")
      @argumentDefinitions(
        search: { type: "String", defaultValue: null }
        first: { type: "Int", defaultValue: 20 }
        after: { type: "String" }
      ) {
        properties(first: $first, after: $after, search: $search) @connection(key: "PropertyPicker_properties", filters: ["search"]) {
          totalCount
          edges { node { id name code city district type countryCode } }
        }
      }
    `,
    props.viewer,
  );
  const intl = useIntl();
  const t = useTheme().tokens;
  const [isPending, startTransition] = useTransition();
  const [input, setInput] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const options = useMemo<PropertyOption[]>(() => data.properties.edges.map((e) => e.node), [data.properties.edges]);
  const [selected, setSelected] = useState<PropertyOption | null>(null);
  const known = options.find((o) => o.id === props.value) ?? (selected?.id === props.value ? selected : null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const search = (text: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => startTransition(() => { refetch({ search: text.trim() || null }, { fetchPolicy: 'store-or-network' }); }), 250);
  };

  const onScroll = (e: UIEvent<HTMLElement>) => {
    const el = e.currentTarget;
    if (hasNext && !isLoadingNext && el.scrollTop + el.clientHeight > el.scrollHeight - 80) loadNext(20);
  };

  return (
    <>
      {props.value && !known && (
        <Suspense fallback={null}>
          <ResolveSelected id={props.value} onResolved={setSelected} />
        </Suspense>
      )}
      <Autocomplete<PropertyOption, false, false, false>
        id={props.id}
        options={known && !options.some((o) => o.id === known.id) ? [known, ...options] : options}
        value={known}
        disabled={props.disabled ?? false}
        filterOptions={(x) => x}
        getOptionLabel={(o) => `${o.name}, ${o.city}`}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        loading={isPending || isLoadingNext}
        inputValue={input}
        onInputChange={(_e, value, reason) => {
          setInput(value);
          if (reason === 'input') search(value);
          if (reason === 'clear') search('');
        }}
        onChange={(_e, option) => { setSelected(option); props.onChange(option?.id ?? null, option); }}
        onBlur={props.onBlur}
        noOptionsText={intl.formatMessage({ id: 'common.none' })}
        slotProps={{ listbox: { onScroll } }}
        renderOption={(liProps, o) => {
          const { key, ...rest } = liProps as typeof liProps & { key: string };
          return (
            <Box component="li" key={key} {...rest} sx={{ display: 'flex', gap: 3, alignItems: 'flex-start', py: 2 }}>
              <Building2 size={16} strokeWidth={1.6} aria-hidden style={{ marginTop: 3, flexShrink: 0, color: t.inkTertiary }} />
              <Box sx={{ minWidth: 0 }}>
                <Box sx={{ fontWeight: 500, color: t.ink }}>{o.name}</Box>
                <Box sx={{ fontSize: '0.75rem', color: t.inkSecondary }}>
                  <Box component="span" sx={{ fontFamily: 'IBM Plex Mono, monospace' }}>{o.code}</Box>
                  {' · '}{[o.district, o.city].filter(Boolean).join(', ')}
                  {' · '}{intl.formatMessage({ id: `propertyType.${o.type}` })}
                </Box>
              </Box>
            </Box>
          );
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            label={props.label}
            required={props.required ?? false}
            error={Boolean(props.error)}
            helperText={props.error ?? props.helperText}
            {...(props.placeholder ? { placeholder: props.placeholder } : {})}
            slotProps={{
              ...params.slotProps,
              input: {
                ...params.slotProps.input,
                endAdornment: (
                  <>
                    {isPending || isLoadingNext ? <CircularProgress color="inherit" size={16} aria-hidden /> : null}
                    {(params.slotProps.input as { endAdornment?: React.ReactNode }).endAdornment}
                  </>
                ),
              },
            }}
          />
        )}
      />
    </>
  );
}

const selectedQuery = graphql`
  query PropertyPickerSelectedQuery($id: ID!) {
    node(id: $id) { ... on Property { id name code city district type countryCode } }
  }
`;

function useProperty(id: string): PropertyOption | null {
  const data = useLazyLoadQuery<PropertyPickerSelectedQuery>(selectedQuery, { id }, { fetchPolicy: 'store-or-network' });
  return data.node && 'name' in data.node && data.node.name ? (data.node as PropertyOption) : null;
}

function ResolveSelected({ id, onResolved }: { id: string; onResolved: (o: PropertyOption | null) => void }) {
  const node = useProperty(id);
  useEffect(() => { onResolved(node); }, [node, onResolved]);
  return null;
}

// The name and location of one property, for summaries.
export function PropertyLabel({ id }: { id: string }) {
  const node = useProperty(id);
  if (!node) return null;
  return <>{node.name}, {[node.district, node.city].filter(Boolean).join(', ')}</>;
}
