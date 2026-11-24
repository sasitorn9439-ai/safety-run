import { avName } from '../shared/avatar.js';
import { SCORE_BUCKET, filterRuns, runStatus, summarize, type RunFilter, type RunStatus } from './admin-stats.js';
import type { AdminRow, AdminRun } from './lib/api.js';
import { $, esc } from './lib/dom.js';

const PAGE = 500;
let rows: AdminRow[] = [];
let runs: AdminRun[] = [];
/** runs that pass the filter bar, newest first */
let shown: AdminRun[] = [];
let showAll = false;
let note = '';
const keyInput = $<HTMLInputElement>('key');
try { keyInput.value = sessionStorage.getItem('srKey') || ''; } catch { /* storage blocked */ }

async function call<T>(data: object): Promise<T> {
  const key = keyInput.value.trim();
  try { sessionStorage.setItem('srKey', key); } catch { /* ignore */ }
  const r = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, ...data }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error === 'key' ? 'Admin key ไม่ถูกต้อง' : 'ผิดพลาด: ' + (j.error || r.status));
  return j as T;
}

const num = (v: string) => (v.trim() === '' || !Number.isFinite(+v) ? null : +v);
const time = (v: string) => { const t = new Date(v).getTime(); return v && Number.isFinite(t) ? t : null; };

function readFilter(): RunFilter {
  const v = (id: string) => $<HTMLInputElement>(id).value, on = (id: string) => $<HTMLInputElement>(id).checked;
  const status = v('f-status'), to = time(v('f-to'));
  return {
    text: v('f-text'),
    status: status === 'finished' || status === 'unfinished' ? status : 'all',
    runNo: num(v('f-run')) ?? 'all',
    from: time(v('f-from')),
    // the picker stops at minutes, so "to 10:30" takes in 10:30:59
    to: to == null ? null : to + 59_999,
    minScore: num(v('f-min')), maxScore: num(v('f-max')),
    includeHidden: on('f-hidden'), includeLegacy: on('f-legacy'),
  };
}

const fmt = (n: number | null, digits = 0) => (n == null ? '—' : n.toLocaleString('th-TH', { maximumFractionDigits: digits }));
const clock = (secs: number | null) => {
  if (secs == null) return '—';
  const t = Math.round(secs);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
const date = (t: string | null) => (t ? new Date(t).toLocaleString('th-TH') : '—');
const STATUS: Record<RunStatus, string> = { finished: 'ส่งคะแนนแล้ว', unfinished: 'ไม่ได้ส่งคะแนน', legacy: 'legacy' };

/** one row per item: label, a bar split into finished and unfinished, then the count */
function bars(items: { label: string; fin: number; unf: number; text: string }[]) {
  if (!items.length) return '<p class="empty">ไม่มีข้อมูลตามตัวกรองนี้</p>';
  const max = items.reduce((m, i) => Math.max(m, i.fin + i.unf), 1);
  return `<div class="bars">${items.map(i => `<span>${esc(i.label)}</span><div class="bar" style="width:${((i.fin + i.unf) / max) * 100}%" title="${esc(`${i.label} · ${i.text}`)}">${
    i.fin ? `<i class="fin" style="flex:${i.fin}"></i>` : ''}${i.unf ? `<i class="unf" style="flex:${i.unf}"></i>` : ''}</div><b>${esc(i.text)}</b>`).join('')}</div>`;
}

function runRow(r: AdminRun) {
  const st = runStatus(r);
  return `<tr${r.hidden ? ' class="hid"' : ''}><td>${esc(r.id)}</td><td>${esc(avName(r.avatar))}</td><td class="n">${r.runNo}</td><td>${date(r.startedAt)}</td><td>${date(r.finishedAt)}</td><td class="n">${clock(r.secs)}</td><td class="n">${r.score ?? '—'}</td><td class="st-${st}">${STATUS[st]}${r.hidden ? ' · ซ่อน' : ''}</td></tr>`;
}

function render() {
  shown = filterRuns(runs, readFilter());
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
  $('by-score').innerHTML = bars(s.scoreBuckets.map(b => ({ label: `${b.from}–${b.from + SCORE_BUCKET - 1}`, fin: b.count, unf: 0, text: String(b.count) })));
  const list = showAll ? shown : shown.slice(0, PAGE);
  $('rb').innerHTML = list.map(runRow).join('');
  $('runs-note').textContent = list.length < shown.length ? `แสดง ${fmt(list.length)} จาก ${fmt(shown.length)} รอบ` : `${fmt(shown.length)} รอบ`;
  $('more').hidden = list.length === shown.length;
}

function fillRunNos() {
  const sel = $<HTMLSelectElement>('f-run'), cur = sel.value;
  const nos = [...new Set(runs.map(r => r.runNo))].sort((a, b) => a - b);
  sel.innerHTML = '<option value="all">ทุกครั้งที่เล่น</option>' + nos.map(n => `<option value="${n}">ครั้งที่ ${n}</option>`).join('');
  sel.value = nos.includes(+cur) ? cur : 'all';
}

async function load() {
  $('msg').textContent = 'กำลังโหลด…';
  try {
    [rows, runs] = await Promise.all([
      call<{ rows: AdminRow[] }>({ action: 'export' }).then(j => j.rows),
      call<{ runs: AdminRun[] }>({ action: 'runs' }).then(j => j.runs),
    ]);
    $('tb').innerHTML = rows.map((r, i) =>
      `<tr${r.hidden ? ' class="hid"' : ''}><td class="n">${i + 1}</td><td>${esc(r.id)}</td><td>${esc(avName(r.avatar))}</td><td class="n">${r.best ?? '—'}</td><td class="n">${r.plays}</td><td>${esc(r.scores)}</td><td>${new Date(r.startedAt).toLocaleString('th-TH')}</td><td class="flag">${[r.unfinished ? r.unfinished + ' ครั้งไม่ได้ส่งคะแนน' : '', r.flagged ? 'มีคะแนนถูกปรับลด' : '', r.hidden ? 'ซ่อนจากตารางอันดับ' : ''].filter(Boolean).join(' · ')}</td><td><button class="alt" data-act="hide" data-id="${esc(r.id)}">${r.hidden ? 'แสดงคะแนน' : 'ซ่อนคะแนน'}</button></td></tr>`).join('');
    fillRunNos();
    render();
    $('msg').textContent = (note ? note + ' · ' : '') + `ผู้เล่น ${rows.length} คน · มีคะแนนแล้ว ${rows.filter(r => r.best != null).length} คน · เล่นรวม ${rows.reduce((a, r) => a + r.plays, 0)} ครั้ง`;
  } catch (e) { $('msg').textContent = (e as Error).message; }
}

async function copyCsv(btn: HTMLElement, header: string, lines: unknown[][]) {
  const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + header + '\n' + lines.map(l => l.map(q).join(',')).join('\n');
  let text: string;
  try { await navigator.clipboard.writeText(csv); text = `คัดลอก ${lines.length} แถวแล้ว`; }
  catch { text = 'คัดลอกไม่ได้ในเบราว์เซอร์นี้'; }
  $('msg').textContent = text;
  btn.dataset.label ??= btn.textContent!;
  btn.textContent = text;
  setTimeout(() => (btn.textContent = btn.dataset.label!), 2000);
}

$('load').onclick = load;
$('csv').onclick = async () => {
  if (!rows.length) await load();
  await copyCsv($('csv'), 'rank,employee_id,avatar_name,best_score,plays,scores,first_started,note',
    rows.map((r, i) => [i + 1, r.id, avName(r.avatar), r.best ?? '', r.plays, r.scores, r.startedAt, [r.flagged ? 'capped' : '', r.hidden ? 'hidden' : ''].filter(Boolean).join(' ')]));
};
$('runs-csv').onclick = async () => {
  if (!runs.length) await load();
  await copyCsv($('runs-csv'), 'employee_id,avatar_name,run_no,started_at,finished_at,play_secs,score,status,hidden',
    shown.map(r => [r.id, avName(r.avatar), r.runNo, r.startedAt, r.finishedAt, r.secs, r.score, runStatus(r), r.hidden ? 'hidden' : '']));
};
$('tb').onclick = async e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
  if (!b) return;
  const id = b.dataset.id!, r = rows.find(x => x.id === id);
  if (!r) return;
  try {
    const hide = !r.hidden;
    if (hide && !confirm(`ซ่อนคะแนนของ ${id} (${avName(r.avatar)}) จากตารางอันดับ?\nข้อมูลยังอยู่ และกดแสดงกลับได้`)) return;
    await call({ action: 'hide', id, hidden: hide });
    note = hide ? `ซ่อนคะแนนของ ${id} จากตารางอันดับแล้ว` : `แสดงคะแนนของ ${id} บนตารางอันดับแล้ว`;
    await load();
    note = '';
  } catch (err) { $('msg').textContent = (err as Error).message; }
};

const filters = $<HTMLFormElement>('filters');
filters.oninput = render;
filters.onsubmit = e => e.preventDefault();
$('f-reset').onclick = () => { filters.reset(); render(); };
$('more').onclick = () => { showAll = true; render(); };
render();
