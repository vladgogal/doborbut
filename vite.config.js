import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';

const SITE_URL = 'https://dobrobuts.com';

// Vite plugin: generates dist/sitemap.xml after build
function sitemapPlugin() {
  return {
    name: 'sitemap',
    closeBundle() {
      let prods = [];
      try {
        // Dynamic import not available here — parse the file directly
        const raw = fs.readFileSync(resolve(__dirname, 'src/data/products.js'), 'utf8');
        const matches = raw.match(/id:\s*(\d+)/g) || [];
        prods = matches.map(m => parseInt(m.replace('id:', '').trim(), 10));
      } catch (_) {}

      const now = new Date().toISOString().split('T')[0];
      const staticUrls = [
        { loc: '/', priority: '1.0', freq: 'daily' },
        { loc: '/#catalog', priority: '0.8', freq: 'weekly' },
      ];
      const prodUrls = prods.map(id => ({
        loc: '/?product=' + id,
        priority: '0.7',
        freq: 'weekly',
      }));

      const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...[...staticUrls, ...prodUrls].map(u =>
          `  <url>\n    <loc>${SITE_URL}${u.loc}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>${u.freq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
        ),
        '</urlset>',
      ].join('\n');

      fs.writeFileSync(resolve(__dirname, 'dist/sitemap.xml'), xml, 'utf8');
      console.log('[sitemap] dist/sitemap.xml written (' + (staticUrls.length + prodUrls.length) + ' URLs)');
    },
  };
}

export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: {
    port: 5173,
    open: true,
  },
  plugins: [sitemapPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
});
