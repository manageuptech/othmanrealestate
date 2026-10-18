import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { noindexPaths } from './src/lib/noindex.mjs';

export default defineConfig({
  site: 'https://alothman.com.sa',
  // the admin server builds into a temp folder, then swaps it in (no downtime)
  outDir: process.env.OUT_DIR || './dist',
  trailingSlash: 'always',
  build: { format: 'directory', assets: 'assets' },
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/admin/') && !noindexPaths().some((p) => page.endsWith(p)),
      i18n: undefined,
    }),
  ],
  compressHTML: true,
});
