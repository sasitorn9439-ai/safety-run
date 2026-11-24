import type { IncomingMessage, ServerResponse } from 'node:http';
import { createPostgresStore } from './postgres-store.js';
import { createPostgresTourStore } from './postgres-tour-store.js';
import type { Reply } from './handlers.js';
import type { Store } from './store.js';
import type { TourStore } from './tour-store.js';

const postgresUrl = () => process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING || '';
let store: Store | undefined, tours: TourStore | undefined;
export const productionStore = () => (store ||= createPostgresStore(postgresUrl()));
export const productionTourStore = () => (tours ||= createPostgresTourStore(postgresUrl()));

export function send(res: ServerResponse, r: Reply) {
  res.statusCode = r.status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', r.cache || 'no-store');
  res.end(JSON.stringify(r.body));
}

export const bodyOf = (req: IncomingMessage & { body?: unknown }): Record<string, unknown> => {
  const b = req.body;
  if (typeof b === 'string') { try { return JSON.parse(b || '{}'); } catch { return {}; } }
  return (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
};

/** Wraps a handler with method check + error handling, shared by every Vercel function. */
export function route(method: 'POST' | 'GET', fn: (req: IncomingMessage & { body?: unknown; query?: Record<string, unknown> }) => Promise<Reply>) {
  return async (req: IncomingMessage & { body?: unknown; query?: Record<string, unknown> }, res: ServerResponse) => {
    if (req.method !== method) return send(res, { status: 405, body: { error: 'method' } });
    try { send(res, await fn(req)); } catch (e) { console.error(e); send(res, { status: 500, body: { error: 'server' } }); }
  };
}
