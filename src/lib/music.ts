/** The tournament's lobby music on the big screen — the same "PPE พร้อม" song the Safety Quiz game uses. Loops only while the lobby is showing. */
export class Music {
  private audio = new Audio('/music/ppe-ready.mp3');
  private wantPlaying = false;
  /** true once a play() attempt has actually been blocked by the browser's autoplay policy (shows "click to turn on") */
  blocked = false;

  constructor(public muted = false) {
    this.audio.loop = true;
    this.audio.preload = 'auto';
    this.audio.volume = 0.55;
  }

  /** call on (or right after) a user gesture; safe and cheap to call repeatedly, including from a page-wide pointerdown */
  unlock() {
    if (!this.wantPlaying || this.muted || !this.audio.paused) return;
    const p = this.audio.play();
    if (p) p.then(() => { this.blocked = false; }, () => { this.blocked = true; });
  }

  play() { this.wantPlaying = true; this.unlock(); }

  stop() { this.wantPlaying = false; this.audio.pause(); this.audio.currentTime = 0; }

  setMuted(m: boolean) {
    this.muted = m;
    if (m) this.audio.pause();
    else this.unlock();
  }
}
