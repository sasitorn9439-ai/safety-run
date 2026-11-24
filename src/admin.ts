import { avName } from '../shared/avatar.js';
import { SCORE_BUCKET, filterRuns, playerHeat, runStatus, summarize, type Range, type RunFilter, type RunStatus } from './admin-stats.js';
import type { AdminRun } from './lib/api.js';
import { $, esc } from './lib/dom.js';

const CACHE = 'srAdmin';
/** what a correct key leaves in this browser: the key and the last runs it loaded, so a reopened page shows data straight away */
interface Cache { key: string; runs: AdminRun[]; at: number }

let key = '';
let runs: AdminRun[] = [];
let loadedAt = 0;
/** filtered runs in the selected column order */
let shown: AdminRun[] = [];
/** 0-based page of the runs table */
let page = 0;

const sortValues = {
  id: (r: AdminRun) => r.id,
  avatar: (r: AdminRun) => avName(r.avatar),
  runNo: (r: AdminRun) => r.runNo,
  startedAt: (r: AdminRun) => Date.parse(r.startedAt),
  finishedAt: (r: AdminRun) => r.finishedAt == null ? null : Date.parse(r.finishedAt),
  secs: (r: AdminRun) => r.secs,
  score: (r: AdminRun) => r.score,
  status: runStatus,
  hidden: (r: AdminRun) => Number(r.hidden),
} satisfies Record<string, (r: AdminRun) => string | number | null>;

let sortColumn: keyof typeof sortValues = 'startedAt';
let sortDirection: 'ascending' | 'descending' = 'descending';
const textOrder = new Intl.Collator('th', { numeric: true, sensitivity: 'base' });
const sortButtons = document.querySelectorAll<HTMLButtonElement>('#runs button[data-sort]');

function sortShown() {
  const value = sortValues[sortColumn];
  const direction = sortDirection === 'ascending' ? 1 : -1;
  shown.sort((a, b) => {
    const left = value(a), right = value(b);
    if (left == null) return right == null ? 0 : 1;
    if (right == null) return -1;
    const order = typeof left === 'number' && typeof right === 'number'
      ? left - right
      : textOrder.compare(String(left), String(right));
    return direction * order;
  });
  for (const button of sortButtons) {
    const header = button.closest('th');
    if (button.dataset.sort === sortColumn) header?.setAttribute('aria-sort', sortDirection);
    else header?.removeAttribute('aria-sort');
  }
}

function readCache(): Cache | null {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE) || 'null') as Cache | null;
    return c && typeof c.key === 'string' && Array.isArray(c.runs) ? c : null;
  } catch { return null; }
}
function writeCache() {
  try { localStorage.setItem(CACHE, JSON.stringify({ key, runs, at: loadedAt } satisfies Cache)); } catch { /* storage full or blocked */ }
}
function clearCache() {
  try { localStorage.removeItem(CACHE); sessionStorage.removeItem('srKey'); } catch { /* ignore */ }
}

class KeyError extends Error {}
async function call<T>(data: object): Promise<T> {
  const r = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, ...data }) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) throw new KeyError('Admin key ไม่ถูกต้อง');
  if (!r.ok) throw new Error('ผิดพลาด: ' + (j.error || r.status));
  return j as T;
}

const num = (v: string) => (v.trim() === '' || !Number.isFinite(+v) ? null : +v);
const time = (v: string) => { const t = new Date(v).getTime(); return v && Number.isFinite(t) ? t : null; };

function readFilter(): RunFilter {
  const v = (id: string) => {
    const el = $<HTMLInputElement>(id);
    el.classList.toggle('on', el.value !== '' && el.value !== 'all');
    return el.value;
  };
  const range = (id: string, parse: (v: string) => number | null, slack = 0): Range => {
    const min = parse(v(id + '-min'));
    const max = parse(v(id + '-max'));
    const format = parse === time
      ? (value: number) => new Date(value).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })
      : (value: number) => String(value);
    const summary = $(id + '-range');
    summary.textContent = min != null && max != null ? `${format(min)} – ${format(max)}`
      : min != null ? `ตั้งแต่ ${format(min)}`
      : max != null ? `ถึง ${format(max)}` : 'ทุกช่วง';
    summary.classList.toggle('on', min != null || max != null);
    return { min, max: max == null ? null : max + slack };
  };
  const status = v('f-status'), hidden = v('f-hidden');
  return {
    id: v('f-id'),
    avatar: v('f-avatar'),
    runNo: num(v('f-run')) ?? 'all',
    // the picker stops at minutes, so "to 10:30" takes in 10:30:59
    started: range('f-start', time, 59_999),
    finished: range('f-end', time, 59_999),
    secs: range('f-secs', num),
    score: range('f-score', num),
    status: status in STATUS ? (status as RunStatus) : 'all',
    hidden: hidden === 'shown' || hidden === 'hidden' ? hidden : 'all',
  };
}

const fmt = (n: number | null, digits = 0) => (n == null ? '—' : n.toLocaleString('th-TH', { maximumFractionDigits: digits }));
const clock = (secs: number | null) => {
  if (secs == null) return '—';
  const t = Math.round(secs);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
const date = (t: string | number | null) => (t ? new Date(t).toLocaleString('th-TH') : '—');
const STATUS: Record<RunStatus, string> = { finished: 'ส่งคะแนนแล้ว', unfinished: 'ไม่ได้ส่งคะแนน', legacy: 'legacy' };

/** one row per item: label, a bar split into finished and unfinished, then the count */
function bars(items: { label: string; fin: number; unf: number; text: string }[]) {
  if (!items.length) return '<p class="empty">ไม่มีข้อมูลตามตัวกรองนี้</p>';
  const max = items.reduce((m, i) => Math.max(m, i.fin + i.unf), 1);
  return `<div class="bars">${items.map(i => `<span>${esc(i.label)}</span><div class="bar" style="width:${((i.fin + i.unf) / max) * 100}%" title="${esc(`${i.label} · ${i.text}`)}">${
    i.fin ? `<i class="fin" style="flex:${i.fin}"></i>` : ''}${i.unf ? `<i class="unf" style="flex:${i.unf}"></i>` : ''}</div><b>${esc(i.text)}</b>`).join('')}</div>`;
}

/** day × hour grid; colour runs one hue from the card surface (none) to brand yellow (busiest cell) */
function heat(runs: readonly AdminRun[]) {
  const h = playerHeat(runs);
  if (!h.days.length) return '<p class="empty">ไม่มีข้อมูลตามตัวกรองนี้</p>';
  const hh = (n: number) => String(n).padStart(2, '0') + ':00';
  const day = (t: number) => new Date(t).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });
  const cell = (n: number, d: number, hour: number) => {
    const k = n / h.max;
    const bg = n ? `color-mix(in oklab, #ffd400 ${Math.round(15 + k * 85)}%, #2a2e35)` : '#191b20';
    const tip = `${day(d)} ${hh(hour)}–${hh(hour + 1)} · ${n} คน`;
    return `<td${k > 0.55 ? ' class="hi"' : ''} style="background:${bg}" title="${esc(tip)}" aria-label="${esc(tip)}">${n || ''}</td>`;
  };
  return `<div class="heat"><table><thead><tr><th></th>${h.hours.map(x => `<th>${hh(x)}</th>`).join('')}</tr></thead><tbody>${
    h.days.map(d => `<tr><th>${esc(day(d.day))}</th>${d.players.map((n, i) => cell(n, d.day, h.hours[i]!)).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function runRow(r: AdminRun) {
  const st = runStatus(r);
  return `<tr${r.hidden ? ' class="hid"' : ''}><td>${esc(r.id)}</td><td>${esc(avName(r.avatar))}</td><td class="n">${r.runNo}</td><td>${date(r.startedAt)}</td><td>${date(r.finishedAt)}</td><td class="n">${clock(r.secs)}</td><td class="n">${r.score ?? '—'}</td><td class="st-${st}">${STATUS[st]}${r.hidden ? ' · ซ่อน' : ''}</td><td><button type="button" class="alt" data-id="${esc(r.id)}">${r.hidden ? 'แสดงคะแนน' : 'ซ่อนคะแนน'}</button></td></tr>`;
}

function render() {
  shown = filterRuns(runs, readFilter());
  sortShown();
  const s = summarize(shown);
  const card = (label: string, value: string) => `<div class="card"><b>${value}</b><span>${label}</span></div>`;
  $('stats').innerHTML = [
    card('ผู้เล่น (คน)', fmt(s.players)),
    card('เริ่มเล่น (รอบ)', fmt(s.started)),
    card('ส่งคะแนนแล้ว', fmt(s.finished)),
    card('ไม่ได้ส่งคะแนน', fmt(s.unfinished)),
    card('อัตราเล่นจบ', s.finishRate == null ? '—' : fmt(s.finishRate * 100, 1) + '%'),
    card('คะแนนสูงสุด', fmt(s.best)),
    card('คะแนนเฉลี่ย', fmt(s.meanScore)),
    card('คะแนนมัธยฐาน', fmt(s.medianScore)),
    card('เวลาเล่นเฉลี่ย (นาที:วินาที)', clock(s.meanSecs)),
  ].join('');
  $('by-hour').innerHTML = bars(s.perHour.map(h => ({
    label: new Date(h.hour).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
    fin: h.finished, unf: h.started - h.finished, text: `${h.finished} / ${h.started}`,
  })));
  $('heat').innerHTML = heat(shown);
  $('by-score').innerHTML = bars(s.scoreBuckets.map(b => ({ label: `${b.from}–${b.from + SCORE_BUCKET - 1}`, fin: b.count, unf: 0, text: String(b.count) })));
  renderPage();
}

/** redraws only the table body and pager, so paging skips the stats and charts */
function renderPage() {
  const size = +$<HTMLSelectElement>('pg-size').value || 50;
  const pages = Math.max(1, Math.ceil(shown.length / size));
  page = Math.min(Math.max(page, 0), pages - 1);
  const start = page * size, list = shown.slice(start, start + size);
  $('rb').innerHTML = list.length ? list.map(runRow).join('') : '<tr><td colspan="9" class="empty">ไม่มีข้อมูลตามตัวกรองนี้</td></tr>';
  $('runs-note').textContent = `${fmt(shown.length)} รอบ`;
  $('export').textContent = `ส่งออก CSV (${fmt(shown.length)} รอบ)`;
  $<HTMLButtonElement>('export').disabled = !shown.length;
  $('pg-info').textContent = list.length ? `${fmt(start + 1)}–${fmt(start + list.length)} จาก ${fmt(shown.length)} · หน้า ${fmt(page + 1)} / ${fmt(pages)}` : '';
  $<HTMLButtonElement>('pg-first').disabled = $<HTMLButtonElement>('pg-prev').disabled = page === 0;
  $<HTMLButtonElement>('pg-last').disabled = $<HTMLButtonElement>('pg-next').disabled = page >= pages - 1;
}

function fillRunNos() {
  const sel = $<HTMLSelectElement>('f-run'), cur = sel.value;
  const nos = [...new Set(runs.map(r => r.runNo))].sort((a, b) => a - b);
  sel.innerHTML = '<option value="all">ทั้งหมด</option>' + nos.map(n => `<option value="${n}">ครั้งที่ ${n}</option>`).join('');
  sel.value = nos.includes(+cur) ? cur : 'all';
}

function showData(note = '') {
  $('gate').hidden = true;
  $('app').hidden = false;
  fillRunNos();
  render();
  $('msg').textContent = note || `ข้อมูลเมื่อ ${date(loadedAt)}`;
}

function lock(message = '') {
  key = '';
  runs = [];
  clearCache();
  $('app').hidden = true;
  $('gate').hidden = false;
  $('gate-msg').textContent = message;
  $<HTMLInputElement>('key').value = '';
  $('key').focus();
}

/** fetch fresh runs; a wrong key locks the page, any other failure keeps whatever is on screen */
async function load(): Promise<boolean> {
  try {
    runs = (await call<{ runs: AdminRun[] }>({ action: 'runs' })).runs;
    loadedAt = Date.now();
    writeCache();
    showData();
    return true;
  } catch (e) {
    if (e instanceof KeyError) lock(e.message);
    else if (!$('app').hidden) $('msg').textContent = `${(e as Error).message} · ยังแสดงข้อมูลเมื่อ ${date(loadedAt)}`;
    else $('gate-msg').textContent = (e as Error).message;
    return false;
  }
}

$<HTMLFormElement>('gate').onsubmit = async e => {
  e.preventDefault();
  key = $<HTMLInputElement>('key').value.trim();
  if (!key) return;
  const btn = $<HTMLButtonElement>('login');
  btn.disabled = true;
  $('gate-msg').textContent = 'กำลังโหลด…';
  await load();
  btn.disabled = false;
};
$('refresh').onclick = async () => { $('msg').textContent = 'กำลังโหลด…'; await load(); };
$('logout').onclick = () => lock();

$('export').onclick = () => {
  const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = shown.map(r => [r.id, avName(r.avatar), r.runNo, r.startedAt, r.finishedAt, r.secs, r.score, runStatus(r), r.hidden ? 'hidden' : '']);
  // BOM so Excel reads the Thai avatar names as UTF-8
  const csv = '﻿employee_id,avatar_name,run_no,started_at,finished_at,play_secs,score,status,hidden\n' + lines.map(l => l.map(q).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const d = new Date(), p = (n: number) => String(n).padStart(2, '0');
  a.download = `safety-run-runs-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  $('msg').textContent = `Export ${fmt(lines.length)} รอบแล้ว`;
};

$('rb').onclick = async e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-id]');
  if (!b) return;
  const id = b.dataset.id!, r = runs.find(x => x.id === id);
  if (!r) return;
  const hide = !r.hidden;
  if (hide && !confirm(`ซ่อนคะแนนของ ${id} (${avName(r.avatar)}) จากตารางอันดับ?\nมีผลกับทุกรอบของผู้เล่นคนนี้ ข้อมูลยังอยู่ และกดแสดงกลับได้`)) return;
  try {
    await call({ action: 'hide', id, hidden: hide });
    for (const x of runs) if (x.id === id) x.hidden = hide;
    writeCache();
    render();
    $('msg').textContent = hide ? `ซ่อนคะแนนของ ${id} จากตารางอันดับแล้ว` : `แสดงคะแนนของ ${id} บนตารางอันดับแล้ว`;
  } catch (err) {
    if (err instanceof KeyError) lock(err.message);
    else $('msg').textContent = (err as Error).message;
  }
};

for (const button of sortButtons) {
  const column = button.dataset.sort;
  if (!isSortColumn(column)) continue;
  button.onclick = () => {
    sortDirection = sortColumn === column && sortDirection === 'descending' ? 'ascending' : 'descending';
    sortColumn = column;
    shown = filterRuns(runs, readFilter());
    sortShown();
    page = 0;
    renderPage();
  };
}

function isSortColumn(column: string | undefined): column is keyof typeof sortValues {
  return column !== undefined && Object.hasOwn(sortValues, column);
}

const filters = $<HTMLFormElement>('filters');
// a new filter starts again from the first page
filters.oninput = () => { page = 0; render(); };
filters.onsubmit = e => e.preventDefault();
const rangePickers = filters.querySelectorAll<HTMLDetailsElement>('details.range');
function closeRanges() {
  for (const picker of rangePickers) picker.open = false;
}
document.addEventListener('click', e => {
  for (const picker of rangePickers) {
    if (e.target instanceof Node && !picker.contains(e.target)) picker.open = false;
  }
});
filters.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !(e.target instanceof HTMLElement)) return;
  const picker = e.target.closest<HTMLDetailsElement>('details.range[open]');
  if (!picker) return;
  picker.open = false;
  picker.querySelector('summary')?.focus();
});
$('f-reset').onclick = () => { filters.reset(); closeRanges(); page = 0; render(); };
const go = (p: number) => { page = p; renderPage(); $('runs').scrollIntoView({ block: 'start' }); };
$('pg-first').onclick = () => go(0);
$('pg-prev').onclick = () => go(page - 1);
$('pg-next').onclick = () => go(page + 1);
// renderPage clamps to the last page
$('pg-last').onclick = () => go(Infinity);
$('pg-size').onchange = () => { page = 0; renderPage(); };

// a key that worked before opens the dashboard on the cached runs, then refreshes them
const cached = readCache();
if (cached) {
  key = cached.key;
  runs = cached.runs;
  loadedAt = cached.at;
  showData(`ข้อมูลเมื่อ ${date(loadedAt)} · กำลังอัปเดต…`);
  void load();
} else {
  lock();
}
