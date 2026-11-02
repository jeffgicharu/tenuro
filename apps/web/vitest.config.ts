import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

// Reuses the Vite config so tests compile graphql`` tags with the same Relay plugin as the app.
export default mergeConfig(viteConfig, defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 20_000,
    css: false,
  },
}));
