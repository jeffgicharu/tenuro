import babel from '@rolldown/plugin-babel';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    react(),
    // Compiles graphql`` tags to imports of the generated Relay artifacts.
    babel({ plugins: [['relay', { eagerEsModules: true }]] }),
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
            // Only the grid itself: by default a group also pulls in its dependencies, which took MUI X
            // internals that the first page needs (date-picker localisation) into this lazy chunk.
            { name: 'grid', test: /node_modules[\\/]@mui[\\/]x-data-grid[\\/]/, includeDependenciesRecursively: false },
            { name: 'intl', test: /node_modules[\\/](react-intl|@formatjs|intl-messageformat)[\\/]/ },
          ],
        },
      },
    },
  },
});
