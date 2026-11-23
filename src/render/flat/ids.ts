/** What the down key can do, by id. Kept in its own tiny file so the renderer can read the ids without loading any drawing code. */
export type SlideId = 'side' | '1' | '2' | '3' | '4' | '5' | 'c1' | 'c2' | 'c3' | 'c4' | 'c5';
export const SLIDE_IDS: readonly SlideId[] = ['side', '1', '2', '3', '4', '5', 'c1', 'c2', 'c3', 'c4', 'c5'];

/** The down-key animation the game uses unless `?slide=` says otherwise: the Tuck ball crouch. */
export const DEFAULT_SLIDE: SlideId = 'c2';
