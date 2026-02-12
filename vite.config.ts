import { defineConfig, type Plugin } from 'vite';
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

// Plugin to inject built asset filenames into sw.js for pre-caching
function swAssetInjector(): Plugin {
  return {
    name: 'sw-asset-injector',
    writeBundle(options) {
      const outDir = options.dir || 'dist';
      const swPath = join(outDir, 'sw.js');

      try {
        let sw = readFileSync(swPath, 'utf-8');

        // Collect all built asset files
        const base = '/claude.notpick/';
        const assets: string[] = [base, `${base}index.html`, `${base}manifest.json`, `${base}icons/icon.svg`, `${base}icons/icon-maskable.svg`, `${base}icons/icon-192.png`, `${base}icons/icon-512.png`];

        const assetsDir = join(outDir, 'assets');
        try {
          const files = readdirSync(assetsDir);
          for (const f of files) {
            assets.push(`${base}assets/${f}`);
          }
        } catch {}

        // Replace the PRECACHE_URLS array
        sw = sw.replace(
          /const PRECACHE_URLS = \[[\s\S]*?\];/,
          `const PRECACHE_URLS = ${JSON.stringify(assets, null, 2)};`
        );

        // Bump cache version based on build time
        sw = sw.replace(
          /const CACHE_NAME = '[^']*'/,
          `const CACHE_NAME = 'notpick-daw-v${Date.now()}'`
        );

        writeFileSync(swPath, sw);
        console.log(`[sw-asset-injector] Injected ${assets.length} assets into sw.js`);
      } catch (err) {
        console.warn('[sw-asset-injector] Warning:', err);
      }
    },
  };
}

export default defineConfig({
  root: '.',
  base: '/claude.notpick/',
  build: {
    outDir: 'dist',
  },
  server: {
    host: true,
  },
  plugins: [swAssetInjector()],
});
