export interface Portrait {
  img: HTMLImageElement | null;
  ready: Promise<void>;
}

export function portraitImage(url: string): Portrait {
  const portrait: Portrait = { img: null, ready: Promise.resolve() };
  if (typeof Image === 'undefined') return portrait;
  const img = new Image();
  img.src = url;
  portrait.ready = img.decode().then(() => { portrait.img = img; }, () => { /* keep the drawn avatar */ });
  return portrait;
}
