/**
 * LINE's in-app browser treats a swipe on the page as its own "swipe down to close" gesture, which can dismiss
 * the whole page mid-run — a real problem for a game whose controls ARE swipes (lane change, jump, slide).
 * The fix is to get the player into their real browser before the game ever boots. Call this first, before
 * anything else starts: it returns true (and shows a one-tap way out) when the page is running inside LINE,
 * in which case the caller should stop and not start the game.
 */
export function escapeLineBrowser(): boolean {
  if (!/\bLine\//i.test(navigator.userAgent)) return false;

  const here = location.href;
  const target = /Android/i.test(navigator.userAgent)
    ? `intent://${location.host}${location.pathname}${location.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(here)};end`
    : `x-safari-https://${location.host}${location.pathname}${location.search}`;

  // the game hasn't booted, so read the saved language straight from storage (see src/i18n)
  let en = false;
  try { en = JSON.parse(localStorage.getItem('srLang') ?? 'null') === 'en'; } catch { /* blocked storage: Thai */ }
  const text = en
    ? { why: 'The game can’t be played inside the LINE app: swiping closes the page.<br>Opening it in your browser…', btn: 'Open in browser' }
    : { why: 'เล่นในแอป LINE ไม่ได้ เพราะปัดจอแล้วหลุดออกจากเกม<br>กำลังเปิดในเบราว์เซอร์ให้อัตโนมัติ…', btn: 'เปิดในเบราว์เซอร์' };
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:#111;color:#fff;font-family:Kanit,sans-serif;text-align:center;padding:24px';
  box.innerHTML = `
    <p style="margin:0;max-width:320px;line-height:1.7;font-size:17px">${text.why}</p>
    <button type="button" style="min-height:48px;padding:0 28px;border:0;border-radius:8px;background:#ffd400;color:#111;font:600 17px Kanit,sans-serif;cursor:pointer">${text.btn}</button>
  `;
  document.body.appendChild(box);
  const go = () => { location.href = target; };
  box.querySelector('button')!.onclick = go;
  go();
  return true;
}
