import '../styles.css';
import './tournament.css';
import { Sfx } from '../lib/audio.js';
import { $ } from '../lib/dom.js';
import { escapeLineBrowser } from '../lib/line-escape.js';
import { createRenderer } from '../render/index.js';
import { hostLogin, savedHost, startHost } from './host.js';
import { startPlayer } from './player.js';

/** /tournament: a phone joins a room (?room=CODE), or the big screen hosts one (?host=CODE) */
async function main() {
  if (escapeLineBrowser()) return; // on the way out to a real browser; don't boot the race behind it
  const { renderer, canvas } = await createRenderer($<HTMLCanvasElement>('c'));
  new ResizeObserver(() => renderer.resize()).observe(canvas);
  renderer.resize();
  const q = new URLSearchParams(location.search);
  const hostCode = q.get('host')?.toUpperCase(), token = hostCode ? savedHost(hostCode) : null;
  if (hostCode && token) startHost(renderer, hostCode, token);
  else {
    startPlayer(renderer, new Sfx(), () => hostLogin(renderer));
    if (q.has('newhost') || (hostCode && !token)) hostLogin(renderer);
  }
}

void main();
