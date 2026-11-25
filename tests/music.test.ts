import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Music } from '../src/lib/music.js';

/** just enough Web Audio to run the sequencer: every node swallows its calls and counts the notes started */
const started = { osc: 0, noise: 0 };
const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} });
const node = (): Record<string, unknown> => {
  const n: Record<string, unknown> = { gain: param(), frequency: param(), detune: param(), Q: param(), threshold: param(), ratio: param(), attack: param(), release: param(), type: '', connect: (to: unknown) => to, start() {}, stop() {} };
  return n;
};
let ac: FakeContext;
class FakeContext {
  currentTime = 0; state = 'running'; sampleRate = 8000; destination = node(); onstatechange: (() => void) | null = null;
  constructor() { ac = this; }
  resume() { return Promise.resolve(); }
  createGain() { return node(); }
  createDynamicsCompressor() { return node(); }
  createBiquadFilter() { return node(); }
  createOscillator() { const n = node(); n.start = () => { started.osc++; }; return n; }
  createBufferSource() { const n = node(); n.start = () => { started.noise++; }; return n; }
  createBuffer(_c: number, len: number) { return { getChannelData: () => new Float32Array(len) }; }
}

describe('Music', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    started.osc = 0; started.noise = 0;
    Object.assign(globalThis, { window: Object.assign(globalThis, { AudioContext: FakeContext }) });
  });
  afterEach(() => vi.useRealTimers());

  const run = (m: Music, seconds: number) => { for (let t = 0; t < seconds; t += 0.06) { ac.currentTime += 0.06; vi.advanceTimersByTime(60); } void m; };

  it('plays every mode without throwing, and each one makes sound', () => {
    for (const mode of ['lobby', 'race', 'final', 'win'] as const) {
      const m = new Music();
      m.setMode(mode);
      m.play();
      const before = started.osc + started.noise;
      run(m, 6);
      expect(started.osc + started.noise).toBeGreaterThan(before);
      m.stop();
    }
  });

  it('moves to a new song on a bar line and not before', () => {
    const m = new Music();
    m.play();
    run(m, 0.3);
    m.setMode('race');
    expect((m as unknown as { mode: string }).mode).toBe('lobby');
    run(m, 4);
    expect((m as unknown as { mode: string }).mode).toBe('race');
    m.setMode('lobby');
    m.setMode('race'); // back to the current song cancels the switch
    expect((m as unknown as { pending: unknown }).pending).toBeNull();
    m.stop();
  });

  it('stays silent while muted and starts again when unmuted', () => {
    const m = new Music(true);
    m.play();
    run(m, 2);
    expect(started.osc + started.noise).toBe(0);
    m.setMuted(false);
    run(m, 2);
    expect(started.osc + started.noise).toBeGreaterThan(0);
    m.stop();
  });

  it('reports a blocked context until the browser lets it run', () => {
    const m = new Music();
    m.play();
    ac.state = 'suspended';
    m.unlock();
    expect(m.blocked).toBe(true);
  });
});
