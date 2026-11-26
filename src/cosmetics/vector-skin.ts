import type { PixelAnim } from '../render/pixel-frames.js';
import type { Art } from '../render/sprites.js';

type FrameArt = Pick<Art, 'box' | 'draw'>;
export type VectorFrames = Record<PixelAnim, readonly FrameArt[]>;

export interface VectorSkin {
  frames: VectorFrames | null;
  load(): Promise<VectorFrames | null>;
}

export function vectorSkin(fetchFrames: () => Promise<VectorFrames>): VectorSkin {
  let pending: Promise<VectorFrames | null> | undefined;
  const skin: VectorSkin = {
    frames: null,
    load: () => pending ??= fetchFrames().then(
      frames => skin.frames = frames,
      error => { console.warn('Could not load skin artwork:', error); return null; },
    ),
  };
  return skin;
}
