import babel from '@rolldown/plugin-babel';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

// The persisted ids of the queries the early data script asks for (src/app/earlyData.ts), taken from
// the Relay compiler's output so that script need not carry the queries themselves.
const EARLY_QUERIES = {
  RootQuery: 'src/app/__generated__/RootQuery.graphql.ts',
  DashboardPageQuery: 'src/features/dashboard/__generated__/DashboardPageQuery.graphql.ts',
  RegisterPageQuery: 'src/features/register/__generated__/RegisterPageQuery.graphql.ts',
  AccountingPageQuery: 'src/features/accounting/__generated__/AccountingPageQuery.graphql.ts',
  LeasePageQuery: 'src/features/lease/__generated__/LeasePageQuery.graphql.ts',
};
// Builds src/early.ts as a chunk of its own and names it in the page ahead of the app, async, so it
// asks for the page's data while the app downloads. (Vite folds every module script in index.html
// into one entry, which would have made it wait for the whole app.)
function earlyData(): Plugin {
  return {
    name: 'tenuro:early-data',
    apply: 'build',
    buildStart() {
      this.emitFile({ type: 'chunk', id: new URL('src/early.ts', import.meta.url).pathname, name: 'early' });
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const early = Object.values(ctx.bundle ?? {}).find((c) => c.type === 'chunk' && c.facadeModuleId?.replaceAll('\\', '/').endsWith('/src/early.ts'));
        if (!early) throw new Error('The early data chunk was not built');
        return html.replace('<script type="module" crossorigin', `<script type="module" async crossorigin src="/${early.fileName}"></script>\n    <script type="module" crossorigin`);
      },
    },
  };
}

function queryIds(): Plugin {
  const id = 'virtual:query-ids';
  return {
    name: 'tenuro:query-ids',
    resolveId: (source) => (source === id ? `\0${id}` : null),
    load(source) {
      if (source !== `\0${id}`) return null;
      const ids = Object.fromEntries(Object.entries(EARLY_QUERIES).map(([name, file]) => {
        this.addWatchFile(new URL(file, import.meta.url).pathname);
        const m = /"id": "([0-9a-f]{40,64})"/.exec(readFileSync(new URL(file, import.meta.url), 'utf8'));
        if (!m) throw new Error(`No persisted id in ${file}; run the Relay compiler`);
        return [name, m[1]];
      }));
      return `export const QUERY_IDS = ${JSON.stringify(ids)};`;
    },
  };
}

// The message catalogue is a dynamic import, so the browser only asked for it once the app had booted
// and rendered, and the first paint waited behind a second round trip. English, the default, is
// preloaded from the page itself (with the chunks it needs), so it downloads alongside the app.
function preloadDefaultCatalogue(): Plugin {
  return {
    name: 'tenuro:preload-default-catalogue',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) return html;
        const chunks = Object.values(bundle).filter((c) => c.type === 'chunk');
        const entry = chunks.find((c) => c.facadeModuleId?.replaceAll('\\', '/').endsWith('/src/i18n/catalogues/en.ts'));
        if (!entry) throw new Error('The English catalogue chunk was not found; the preload would silently stop working');
        const files = new Set<string>();
        const visit = (file: string) => {
          if (files.has(file)) return;
          files.add(file);
          const c = chunks.find((x) => x.fileName === file);
          c?.imports.forEach(visit);
        };
        visit(entry.fileName);
        const links = [...files]
          .filter((f) => !html.includes(`/${f}"`))
          .map((f) => `<link rel="modulepreload" crossorigin href="/${f}">`);
        // The body face (IBM Plex Sans, Latin, regular: about 23 KB) is asked for with the page, not once
        // the stylesheet is parsed. The display face is left to load normally: at about 130 KB it would
        // hold up the code that paints the page on a slow connection.
        const body = Object.values(bundle).find((a) => a.type === 'asset' && /ibm-plex-sans-latin-400-normal-[^/]*\.woff2$/.test(a.fileName));
        if (!body) throw new Error('The body font file was not found; the font preload would silently stop working');
        links.push(`<link rel="preload" as="font" type="font/woff2" crossorigin href="/${body.fileName}">`);
        return html.replace('</head>', `    ${links.join('\n    ')}\n  </head>`);
      },
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    // Compiles graphql`` tags to imports of the generated Relay artifacts.
    babel({ plugins: [['relay', { eagerEsModules: true }]] }),
    preloadDefaultCatalogue(),
    queryIds(),
    earlyData(),
  ],
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    proxy: {
      '/graphql': `http://127.0.0.1:${process.env.API_PORT ?? 4000}`,
      '/api': `http://127.0.0.1:${process.env.API_PORT ?? 4000}`,
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    manifest: true,
    assetsInlineLimit: 0,
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/ },
            { name: 'relay', test: /node_modules[\\/](react-relay|relay-runtime)[\\/]/ },
            // Only MUI's styling core is pinned to one chunk. Material components are left to normal
            // splitting, so a component used only by a lazy page (the form's Autocomplete, say)
            // ships with that page instead of weighing down the first one.
            { name: 'mui', test: /node_modules[\\/](@mui[\\/](system|utils|styled-engine|private-theming)|@emotion|stylis)[\\/]/ },
            // The data grid has no group of its own. Pinning it alone (without its dependencies) left
            // it in an import cycle with the Material chunks it styles, so in production it ran
            // styled(undefined) and the register could not load. Left to normal splitting, it ships
            // with the register route, the only page that uses it.
            { name: 'intl', test: /node_modules[\\/](react-intl|@formatjs|intl-messageformat)[\\/]/ },
          ],
        },
      },
    },
  },
});
