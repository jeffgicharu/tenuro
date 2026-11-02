import type { StorybookConfig } from '@storybook/react-vite';

// Tenuro's component library, published at /storybook. Stories sit next to their components.
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)', '../src/**/*.mdx'],
  addons: ['@storybook/addon-a11y', '@storybook/addon-docs'],
  framework: { name: '@storybook/react-vite', options: {} },
  core: { disableTelemetry: true, disableWhatsNewNotifications: true },
  typescript: { reactDocgen: false },
  // The app's public folder holds 25 MB of photographs the stories do not need.
  // The app's catalogue preload belongs to the app's page; Storybook's bundle has no such chunk.
  viteFinal: (cfg) => ({
    ...cfg,
    publicDir: false,
    plugins: (cfg.plugins ?? []).flat().filter((p) => !(p && typeof p === 'object' && 'name' in p && ['tenuro:preload-default-catalogue', 'tenuro:early-data'].includes(p.name as string))),
  }),
};
export default config;
