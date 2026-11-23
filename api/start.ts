import { start } from '../server/handlers.js';
import { bodyOf, productionStore, route } from '../server/runtime.js';

export default route('POST', req => start(productionStore(), bodyOf(req), String(req.headers['user-agent'] || '')));
