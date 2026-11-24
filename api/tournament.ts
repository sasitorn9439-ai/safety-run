import { tournament } from '../server/tournament.js';
import { bodyOf, productionStore, productionTourStore, route } from '../server/runtime.js';

export default route('POST', req => tournament(productionStore(), productionTourStore(), bodyOf(req)));
