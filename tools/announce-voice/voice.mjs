#!/usr/bin/env node
/**
 * Writes the narration for the /announce deck and, optionally, records it.
 *
 *   node tools/announce-voice/voice.mjs script [options]   resolve the script with the real numbers (no audio, no cost)
 *   node tools/announce-voice/voice.mjs check  [options]   which lines are already recorded and which need recording (no audio, no cost)
 *   node tools/announce-voice/voice.mjs voice  [options]   script + text-to-speech → public/announce-audio/*.mp3 + manifest.json
 *   node tools/announce-voice/voice.mjs voices             list the voices in the ElevenLabs account (to pick --voice)
 *
 * Options
 *   --demo[=scale]      made-up players (rehearsal) instead of the admin API
 *   --base <url>        server to read the data from (default http://localhost:5173); the admin key is read from $ADMIN_KEY
 *   --before <iso>      cut the data off at this time (default: the server's cutoff)
 *   --gender female|male   polite particles ค่ะ/ครับ and the default voice (default female)
 *   --provider say|azure|google|elevenlabs   (default say: the free macOS voice, for rehearsal)
 *   --voice <name>      provider voice (default per provider)
 *   --rate <n>          speaking speed, 1 = normal (default 1). Providers without a speed setting (ElevenLabs v3) are sped up with
 *                       ffmpeg from the saved original, so changing --rate never calls the API again
 *   --only a,b          only these line ids (see `script` output)
 *   --force             re-record even if the text is unchanged
 *   --yes               do not ask before using a paid provider
 *   --stability 0|0.5|1 ElevenLabs v3 expressiveness: 0 Creative (most excited), 0.5 Natural, 1 Robust (default: ELEVENLABS_STABILITY or 0.5)
 *   --parallel <n>      lines recorded at once (default 2)
 *   --out <dir>         audio folder (default public/announce-audio)
 *
 * Wording: edit src/announce/narration.ts, or override single lines in src/announce/narration-overrides.ts.
 * Only lines whose text changed are recorded again, so the lines that do not depend on the data (cover, the prize announcements, the
 * closing) can be recorded days ahead, and after the cutoff `voice` redoes just the totals and the winners.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { PROVIDERS, elevenlabsVoices, withRetry } from './providers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HERE = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { o._.push(a); continue; }
    const [k, inline] = a.slice(2).split('=');
    const flag = ['demo', 'force', 'yes'].includes(k);
    o[k] = inline ?? (flag ? true : argv[++i]);
  }
  return o;
}

const opts = parseArgs(process.argv.slice(2));
const command = opts._[0];
if (!['script', 'check', 'voice', 'voices'].includes(command)) {
  console.error(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^[/ *]+/gm, '').trim());
  process.exit(command ? 1 : 0);
}

if (command === 'voices') {
  for (const v of await elevenlabsVoices()) console.log(`${v.id}  ${v.name}  [${v.category}]  ${v.languages || '-'}  ${Object.values(v.labels).join(', ')}${v.preview ? `\n    ${v.preview}` : ''}`);
  process.exit(0);
}

const gender = opts.gender === 'male' ? 'male' : 'female';
const providerName = opts.provider || 'say';
const provider = PROVIDERS[providerName];
if (!provider) { console.error(`unknown provider "${providerName}" (say, azure, google, elevenlabs)`); process.exit(1); }
const rate = Number(opts.rate || 1);
const outDir = path.resolve(ROOT, opts.out || 'public/announce-audio');

/* ---------- the data and the script ---------- */
// the deck's own TypeScript (calc, narration, demo) is loaded through Vite, so the script and the slides can never disagree
const vite = await createServer({ root: ROOT, configFile: false, appType: 'custom', logLevel: 'error', server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true } });
let rows, cutoff;
try {
  const calc = await vite.ssrLoadModule('/src/announce/calc.ts');
  const narr = await vite.ssrLoadModule('/src/announce/narration.ts');
  if (opts.demo) {
    const demo = await vite.ssrLoadModule('/src/announce/demo.ts');
    rows = demo.demoPlayers(Number(opts.demo === true ? 1 : opts.demo) || 1);
  } else {
    const key = process.env.ADMIN_KEY;
    if (!key) throw new Error('set ADMIN_KEY in the environment (or use --demo)');
    const base = (opts.base || 'http://localhost:5173').replace(/\/$/, '');
    const r = await fetch(`${base}/api/admin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, action: 'announce', ...opts.before && { before: opts.before } }) });
    if (!r.ok) throw new Error(`${base}/api/admin answered ${r.status}`);
    const j = await r.json();
    rows = j.players; cutoff = j.before;
  }
  const facts = calc.factsOf(rows);
  if (cutoff && Date.now() < new Date(cutoff).getTime()) {
    console.warn(`\n⚠ the data is not final yet: it is cut off at ${cutoff}. Rankings and totals can still change; record the lines that name winners after that.\n`);
  }
  await run(facts, narr.narrationFor(facts, { gender, cutoff }));
} finally {
  await vite.close();
}

/* ---------- output ---------- */
async function run(facts, lines) {
  const md = [
    `# สคริปเสียงบรรยาย /announce`, '',
    `ผู้เล่น ${facts.players} คน · ${Math.round(facts.km)} กม. · ${Math.round(facts.hours)} ชม. · ผู้ชนะ ${facts.winners.length} คน · gender=${gender}`, '',
    ...lines.flatMap(l => [`## ${l.id}`, '', ...l.text.split('\n').map(s => `- ${s}`), '']),
  ].join('\n');
  fs.writeFileSync(path.join(HERE, 'last-script.md'), md);
  console.log(md);
  console.log(`(saved to tools/announce-voice/last-script.md · ${lines.length} lines, ${lines.reduce((n, l) => n + l.text.length, 0)} characters)`);
  if (command === 'script') return;

  const only = opts.only ? new Set(String(opts.only).split(',').map(s => s.trim())) : null;
  if (only) for (const id of only) if (!lines.some(l => l.id === id)) throw new Error(`no such line: ${id}`);
  const voice = opts.voice || provider.voice(gender);
  const stability = providerName === 'elevenlabs' ? Number(opts.stability ?? process.env.ELEVENLABS_STABILITY ?? 0.5) : undefined;
  const cfg = { voice, rate, gender, stability };
  const manifestFile = path.join(outDir, 'manifest.json');
  const old = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : { clips: {} };
  // the speed is part of what the provider is asked for only when it can do it itself
  const hashOf = text => crypto.createHash('sha1').update(JSON.stringify({ providerName, voice, rate: provider.nativeRate ? rate : 1, stability, text })).digest('hex').slice(0, 16);
  // the untouched provider output, kept (not served) so the tempo can be changed without paying again
  const rawDir = path.join(HERE, 'raw', path.basename(outDir));
  const rawFile = l => fs.existsSync(rawDir) ? fs.readdirSync(rawDir).find(f => f.startsWith(`${l.id}.`)) : undefined;

  // a line is up to date when its recorded text, provider, voice and speed are what they would be now, and the file is there
  const upToDate = l => old.clips[l.id]?.hash === hashOf(l.text) && fs.existsSync(path.join(outDir, old.clips[l.id].file));
  // up to date for the API, but encoded at another tempo: no API call, just ffmpeg from the saved original
  const retempo = lines.filter(l => (!only || only.has(l.id)) && upToDate(l) && !provider.nativeRate && (old.clips[l.id].rate ?? 1) !== rate && rawFile(l));
  const todo = lines.filter(l => (!only || only.has(l.id)) && (opts.force || !upToDate(l)));
  const chars = todo.reduce((n, l) => n + l.text.length, 0);
  console.log(`\nprovider ${providerName} · voice ${voice || '(none)'} · ${lines.filter(upToDate).length} of ${lines.length} lines already recorded, ${todo.length} to record (${chars} characters)`);
  if (todo.length) console.log('  to record: ' + todo.map(l => l.id).join(', '));
  if (command === 'check') return;
  if (retempo.length) console.log(`  speed changed to ${rate} for ${retempo.length} recorded lines: re-encoding from the saved originals (no API call)`);
  if (!todo.length && !retempo.length) { console.log('nothing to do'); return; }
  if (provider.paid && todo.length && !opts.yes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ans = await rl.question(`This sends ${chars} characters of text to ${providerName} (a paid service). Continue? [y/N] `);
    rl.close();
    if (!/^y/i.test(ans)) { console.log('cancelled'); return; }
  }

  fs.mkdirSync(outDir, { recursive: true });
  const haveFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
  const clips = {};
  for (const l of lines) {
    const prev = old.clips[l.id];
    if (!todo.includes(l) && prev && fs.existsSync(path.join(outDir, prev.file))) clips[l.id] = prev;
  }

  async function record(l) {
    const { data, ext } = await withRetry(() => provider.synth(l.text, cfg));
    fs.mkdirSync(rawDir, { recursive: true });
    const raw = path.join(rawDir, `${l.id}.${ext}`);
    fs.writeFileSync(raw, data);
    finish(l, raw, ext);
  }

  /** raw provider audio → the served mp3: loudness evened out, tempo applied when the provider could not */
  function finish(l, raw, ext) {
    const file = `${l.id}.mp3`, dest = path.join(outDir, file);
    const tempo = provider.nativeRate ? 1 : rate;
    if (haveFfmpeg) {
      // one loudness for every clip, so the host's voice does not jump between slides
      const filters = [...tempo !== 1 ? [`atempo=${tempo}`] : [], 'loudnorm=I=-16:TP=-1.5:LRA=11'].join(',');
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-af', filters, '-ar', '44100', '-ac', '1', '-b:a', '128k', dest]);
    } else if (ext === 'mp3' && tempo === 1) fs.copyFileSync(raw, dest);
    else throw new Error('ffmpeg is needed here (to convert the `say` voice, or to change the speed)');
    let seconds;
    try { seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', dest]).toString().trim()); } catch { /* no ffprobe */ }
    clips[l.id] = { file, hash: hashOf(l.text), text: l.text, rate, ...seconds && { seconds: Math.round(seconds * 10) / 10 } };
    console.log(`  ${l.id} … ${seconds ? seconds.toFixed(1) + ' s' : 'done'}`);
    // save as we go: if the run stops half way, what is recorded is kept
    fs.writeFileSync(manifestFile, JSON.stringify({ provider: providerName, voice, gender, generatedAt: new Date().toISOString(), clips }, null, 2));
  }

  for (const l of retempo) finish(l, path.join(rawDir, rawFile(l)), path.extname(rawFile(l)).slice(1));

  // a small pool: a few lines at once, in order, and the first failure stops the rest
  const queue = [...todo], failures = [];
  await Promise.all(Array.from({ length: Math.max(1, Number(opts.parallel) || 2) }, async () => {
    while (queue.length && !failures.length) {
      const l = queue.shift();
      try { await record(l); } catch (e) { failures.push(`${l.id}: ${e.message}`); }
    }
  }));
  if (failures.length) { console.error('\nfailed:\n  ' + failures.join('\n  ') + '\nrun the same command again to record the rest'); process.exitCode = 1; return; }

  const total = Object.values(clips).reduce((n, c) => n + (c.seconds || 0), 0);
  console.log(`\nwrote ${todo.length} clips; ${Object.keys(clips).length} in all${total ? ` (${Math.round(total)} s of speech)` : ''} in ${path.relative(ROOT, outDir)}/manifest.json`);
  console.log('open /announce (same data and cutoff) and the narration plays by itself; N toggles it.');
}
