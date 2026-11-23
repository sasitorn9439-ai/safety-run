import type { GameObject, SimEvent } from '../../shared/sim.js';

/** Everything a renderer needs to know about the world at one instant. */
export interface SceneState {
  dist: number; lane: number; px: number; py: number; vy: number; slide: number; inv: number; shield: number;
  objs: readonly GameObject[];
}
/** The state one simulation tick earlier; renderers blend prev → s by `alpha` so motion stays smooth at any refresh rate. */
export interface PrevState { dist: number; px: number; py: number; slide: number }
export interface Frame {
  s: SceneState; prev: PrevState; alpha: number; playing: boolean; flash: number;
  /** the world is standing still while the mascot is on the ground (tutorial waiting for the player): show the idle breathing, not a frozen stride */
  still?: boolean;
}

/** What the game loop needs from a renderer. Two implementations: WebGL (PixiJS) and Canvas2D (fallback). */
export interface GameRenderer {
  readonly kind: 'pixi' | 'canvas';
  /** which mascot art is being drawn */
  readonly mascot: 'flat' | 'smooth' | 'pixel' | 'vector';
  /** Call when the canvas CSS size changes. */
  resize(): void;
  /** Rebuild sprites, e.g. once the web font has loaded and sprite text can be drawn properly. */
  rebuild(): void;
  /** Cosmetic reactions to sim events (particles, shake). */
  onEvent(e: SimEvent, px: number): void;
  render(f: Frame, now: number): void;
  /** Current render scale (device pixels per CSS pixel); drops on slow devices. */
  readonly renderScale: number;
}
