import type { StorybookConfig } from '@storybook/react-vite';

// Tenuro's component library, published at /storybook. Stories sit next to their components.
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)', '../src/**/*.mdx'],
  addons: ['@storybook/addon-a11y', '@storybook/addon-docs'],
  framework: { name: '@storybook/react-vite', options: {} },
  core: { disableTelemetry: true, disableWhatsNewNotifications: true },
  typescript: { reactDocgen: false },
  // The app's public folder holds 25 MB of photographs the stories do not need.
  viteFinal: (cfg) => ({ ...cfg, publicDir: false }),
};
export default config;
