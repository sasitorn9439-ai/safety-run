import { announceVoice } from '../server/announce-voice.js';
import { bodyOf, productionStore, route } from '../server/runtime.js';

export default route('POST', req => announceVoice(productionStore(), bodyOf(req)));
