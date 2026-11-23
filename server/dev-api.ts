import type { Plugin } from 'vite';
import { admin, finish, leaderboard, start, type Reply } from './handlers.js';
import { createMemoryStore } from './memory-store.js';

/** Serves /api/* from memory while `vite` is running, so the game works without Postgres. */
export function devApi(): Plugin {
  return {
    name: 'safety-run-dev-api',
    apply: 'serve',
    configureServer(server) {
      process.env.ADMIN_KEY ||= 'dev';
      const store = createMemoryStore();
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost');
        if (!url.pathname.startsWith('/api/')) return next();
        const send = (r: Reply) => {
          res.statusCode = r.status;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(r.body));
        };
        try {
          let body: Record<string, unknown> = {};
          if (req.method === 'POST') {
            const chunks: Buffer[] = [];
            for await (const c of req) chunks.push(c as Buffer);
            try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { /* empty body */ }
          }
          const ua = String(req.headers['user-agent'] || '');
          const route = url.pathname.slice(5);
          const post = req.method === 'POST';
          if (route === 'start' && post) return send(await start(store, body, ua));
          if (route === 'finish' && post) return send(await finish(store, body));
          if (route === 'admin' && post) return send(await admin(store, body));
          if (route === 'leaderboard' && req.method === 'GET') return send(await leaderboard(store, url.searchParams.get('id')));
          send({ status: 404, body: { error: 'not_found' } });
        } catch (e) {
          console.error(e);
          send({ status: 500, body: { error: 'server' } });
        }
      });
      server.config.logger.info('  [dev-api] /api/* is served from memory (resets on restart). Admin key: ' + process.env.ADMIN_KEY);
    },
  };
}
