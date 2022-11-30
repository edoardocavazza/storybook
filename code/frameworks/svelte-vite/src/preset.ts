import { type StorybookConfig, withoutVitePlugins } from '@storybook/builder-vite';
import { deprecate } from '@storybook/node-logger';
import { hasPlugin } from './utils';
import { svelteDocgen } from './plugins/svelte-docgen';

export const core: StorybookConfig['core'] = {
  builder: '@storybook/builder-vite',
  renderer: '@storybook/svelte',
};

export const viteFinal: NonNullable<StorybookConfig['viteFinal']> = async (config, options) => {
  let { plugins = [] } = config;
  const { svelte, loadSvelteConfig } = await import('@sveltejs/vite-plugin-svelte');
  const svelteOptions: Record<string, any> = await options.presets.apply(
    'svelteOptions',
    {},
    options
  );
  const svelteConfig = { ...(await loadSvelteConfig()), ...svelteOptions };

  // Add svelte plugin if not present
  if (!hasPlugin(plugins, 'vite-plugin-svelte')) {
    plugins.push(svelte());
  }

  // Add docgen plugin
  plugins.push(svelteDocgen(svelteConfig));

  // TODO: better SvelteKit detection, this warns when using @storybook/svelte-kit too
  if (hasPlugin(plugins, 'vite-plugin-svelte-kit')) {
    deprecate(
      'SvelteKit support in @storybook/svelte-vite is deprecated in Storybook 7.0, use the official @storybook/svelte-kit framework instead.'
    );
  }
  // Remove vite-plugin-svelte-kit from plugins if using SvelteKit
  // see https://github.com/storybookjs/storybook/issues/19280#issuecomment-1281204341
  plugins = withoutVitePlugins(plugins, ['vite-plugin-svelte-kit']);

  // TODO: temporary until/unless https://github.com/storybookjs/addon-svelte-csf/issues/64 is fixed
  // Wrapping in try-catch in case `@storybook/addon-svelte-csf is not installed
  try {
    const { default: svelteCsfPlugin } = await import('./plugins/csf-plugin');
    plugins.push(svelteCsfPlugin(svelteConfig));
  } catch (err) {
    // Not all projects use `.stories.svelte` for stories, and by default 6.5+ does not auto-install @storybook/addon-svelte-csf.
    // If it's any other kind of error, re-throw.
    if ((err as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') {
      throw err;
    }
  }

  return {
    ...config,
    plugins,
  };
};
