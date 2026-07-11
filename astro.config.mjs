// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// USER site (hamidthri.github.io) → base is '/'.
export default defineConfig({
  site: 'https://hamidthri.github.io',
  base: '/',
  trailingSlash: 'ignore',
  // About now lives at the root; keep old /about links working.
  redirects: { '/about': '/' },
  integrations: [mdx(), sitemap()],
  build: { format: 'directory' },
  prefetch: { prefetchAll: true, defaultStrategy: 'viewport' },
});
