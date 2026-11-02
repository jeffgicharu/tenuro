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
    assetsInlineLimit: 0,
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/ },
            { name: 'relay', test: /node_modules[\\/](react-relay|relay-runtime)[\\/]/ },
            { name: 'mui', test: /node_modules[\\/](@mui[\\/](material|system|utils|styled-engine|private-theming|core-downloads-tracker)|@emotion|stylis)[\\/]/ },
            { name: 'grid', test: /node_modules[\\/]@mui[\\/]x-data-grid[\\/]/ },
            { name: 'intl', test: /node_modules[\\/](react-intl|@formatjs|intl-messageformat)[\\/]/ },
          ],
        },
      },
    },
  },
});
