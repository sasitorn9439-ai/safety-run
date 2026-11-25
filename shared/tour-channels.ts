/**
 * A tournament room's two one-way realtime channels: phones speak `up` to the big screen, the big screen speaks `down` to the phones.
 * They share the `safety-run-tour` namespace, so an Ably key restricted to `safety-run-tour:*` covers every room (Ably only
 * understands a wildcard after a namespace's colon).
 */
/** players a room holds */
export const TOUR_SEATS = 8;

export const TOUR_NAMESPACE = 'safety-run-tour';
export const tourTopic = (code: string, way: 'up' | 'down') => `${TOUR_NAMESPACE}:${code}-${way}`;
