import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const OUT = resolve(import.meta.dirname, '../../assets/mascot');

/** Dev-only: the baking page POSTs each PNG/JSON here and it lands in assets/mascot/. */
function save(): Plugin {
  return {
    name: 'mascot-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/save', (req, res) => {
        const rel = decodeURIComponent((req.url || '').split('?')[0]!).replace(/^\/+/, '');
        if (req.method !== 'POST' || !/^[\w@.-]+(\/[\w@.-]+)*$/.test(rel) || rel.includes('..')) { res.statusCode = 400; res.end('bad path'); return; }
        const chunks: Buffer[] = [];
        req.on('data', c => chunks.push(c as Buffer));
        req.on('end', () => {
          const file = resolve(OUT, rel);
          mkdirSync(dirname(file), { recursive: true });
          writeFileSync(file, Buffer.concat(chunks));
          res.end('ok');
        });
      });
    },
  };
}

export default defineConfig({ root: import.meta.dirname, plugins: [save()], server: { port: 5180 }, cacheDir: resolve(import.meta.dirname, '../../node_modules/.vite-mascot') });
