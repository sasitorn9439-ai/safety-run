import { leaderboard } from '../server/handlers.js';
import { productionStore, route } from '../server/runtime.js';

export default route('GET', req => leaderboard(productionStore(), req.query?.id));
