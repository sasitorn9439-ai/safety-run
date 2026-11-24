import { Canvas2DRenderer } from './canvas2d.js';
import { DEFAULT_SLIDE, SLIDE_IDS, type SlideId } from './flat/ids.js';
import { loadMascot, type MascotSet, type MascotStyle } from './pixel-mascot.js';
import type { GameRenderer } from './types.js';

export type { Frame, GameRenderer, Ghost, PrevState, SceneState } from './types.js';

const hasWebGL2 = () => { try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; } };

/**
 * WebGL (PixiJS) when the device supports it, Canvas2D otherwise. `?renderer=canvas` forces the fallback.
 * Returns the canvas actually in use: a canvas that has been given a WebGL context can't later give out a 2D one,
 * so if Pixi fails to start we swap in a fresh element.
 */
export async function createRenderer(canvas: HTMLCanvasElement): Promise<{ renderer: GameRenderer; canvas: HTMLCanvasElement }> {
  const q = new URLSearchParams(location.search);
  const forced = q.get('renderer');
  // `?mascot=` flat (default) | smooth | pixel | vector (the original, drawn by the first renderer code)
  const want = q.get('mascot');
  let pixel: MascotSet | undefined;
  if (want !== 'vector') {
    const style: MascotStyle = want === 'pixel' ? 'pixel' : want === 'smooth' ? 'smooth' : 'flat';
    // ?slide= side | 1..5 (slides seen from behind) | c1..c5 (crouches) picks what the flat mascot does on the down key (default: c2, Tuck ball)
    const asked = q.get('slide') as SlideId | null;
    const slide = asked && SLIDE_IDS.includes(asked) ? asked : DEFAULT_SLIDE;
    try { pixel = await loadMascot(style, slide); } catch (e) { console.warn(`${style} mascot unavailable, using the original vector one:`, e); }
  }
  if (forced !== 'canvas' && hasWebGL2()) {
    try {
      // loaded on demand so devices that take the fallback never download the engine
      const { PixiRenderer } = await import('./pixi.js');
      return { renderer: await PixiRenderer.create(canvas, pixel), canvas };
    } catch (e) {
      console.warn('WebGL renderer unavailable, using Canvas2D:', e);
      const fresh = canvas.cloneNode(false) as HTMLCanvasElement;
      canvas.replaceWith(fresh);
      canvas = fresh;
    }
  }
  return { renderer: new Canvas2DRenderer(canvas, pixel), canvas };
}
