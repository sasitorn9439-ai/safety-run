import { avName } from '../shared/avatar.js';
import type { AdminRow } from './lib/api.js';
import { $, esc } from './lib/dom.js';

let rows: AdminRow[] = [];
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

async function load() {
  $('msg').textContent = 'กำลังโหลด…';
  try {
    rows = (await call<{ rows: AdminRow[] }>({ action: 'export' })).rows;
    $('tb').innerHTML = rows.map((r, i) =>
      `<tr><td class="n">${i + 1}</td><td>${esc(r.id)}</td><td>${esc(avName(r.avatar))}</td><td class="n">${r.best ?? '—'}</td><td class="n">${r.plays}</td><td>${esc(r.scores)}</td><td>${new Date(r.startedAt).toLocaleString('th-TH')}</td><td class="flag">${[r.unfinished ? r.unfinished + ' ครั้งไม่ได้ส่งคะแนน' : '', r.flagged ? 'มีคะแนนถูกปรับลด' : ''].filter(Boolean).join(' · ')}</td></tr>`).join('');
    $('msg').textContent = `ผู้เล่น ${rows.length} คน · มีคะแนนแล้ว ${rows.filter(r => r.best != null).length} คน · เล่นรวม ${rows.reduce((a, r) => a + r.plays, 0)} ครั้ง`;
  } catch (e) { $('msg').textContent = (e as Error).message; }
}

$('load').onclick = load;
$('csv').onclick = async () => {
  if (!rows.length) await load();
  const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿rank,employee_id,avatar_name,best_score,plays,scores,first_started,note\n' +
    rows.map((r, i) => [i + 1, r.id, avName(r.avatar), r.best ?? '', r.plays, r.scores, r.startedAt, r.flagged ? 'capped' : ''].map(q).join(',')).join('\n');
  try { await navigator.clipboard.writeText(csv); $('msg').textContent = 'คัดลอก CSV แล้ว วางใน Excel ได้เลย'; }
  catch { $('msg').textContent = 'คัดลอกไม่ได้ในเบราว์เซอร์นี้'; }
};
$('reset').onclick = async () => {
  const id = $<HTMLInputElement>('rid').value.trim().toUpperCase();
  if (!id) return;
  try {
    await call({ action: 'reset', id });
    $('msg').textContent = `ลบผลเล่นของ ${id} แล้ว (ไอคอนเดิมยังเป็นของรหัสนี้)`;
    $<HTMLInputElement>('rid').value = '';
    void load();
  } catch (e) { $('msg').textContent = (e as Error).message; }
};
