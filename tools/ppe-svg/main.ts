import { PPE_ICON_NAMES, iconSvg } from '../../src/render/ppe-icons.js';

const url = (svg: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
const fig = (name: string, size: number) => {
  const f = document.createElement('figure');
  f.innerHTML = `<img src="${url(iconSvg(name as never, size))}" width="${size}" height="${size}" alt="${name}"><figcaption>${name}</figcaption>`;
  return f;
};
for (const n of PPE_ICON_NAMES) { document.getElementById('light')!.appendChild(fig(n, 150)); document.getElementById('dark')!.appendChild(fig(n, 150)); }
for (const n of PPE_ICON_NAMES) document.getElementById('small')!.appendChild(fig(n, 40));   // how they read when small

async function post(path: string, body: string) {
  const r = await fetch('/save/' + path, { method: 'POST', body });
  if (!r.ok) throw new Error(`save ${path}: ${r.status}`);
}
async function save() {
  for (const n of PPE_ICON_NAMES) await post(`svg/${n}.svg`, iconSvg(n, 256));
  // all eight side by side
  const cells = PPE_ICON_NAMES.map((n, i) => `<g id="${n}" transform="translate(${i * 100} 0)">${iconSvg(n).replace(/^<svg[^>]*>|<\/svg>\s*$/g, '')}</g>`).join('');
  await post('svg/sheet.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PPE_ICON_NAMES.length * 100} 100" width="${PPE_ICON_NAMES.length * 128}" height="128">${cells}</svg>\n`);
  document.getElementById('log')!.textContent = `saved ${PPE_ICON_NAMES.length} icons + sheet`;
  (window as unknown as { __done: boolean }).__done = true;
}
document.getElementById('save')!.onclick = () => void save();
if (new URLSearchParams(location.search).has('auto')) void save(); else (window as unknown as { __done: boolean }).__done = true;
