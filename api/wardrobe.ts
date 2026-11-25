import { wardrobe } from '../server/handlers.js';
import { bodyOf, productionStore, route } from '../server/runtime.js';

export default route('POST', req => wardrobe(productionStore(), bodyOf(req)));
