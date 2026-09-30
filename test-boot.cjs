/* Regression test for the boot-crash class of bug: any malformed persisted
   record must not prevent the console from wiring up its controls.
   Run: node test-boot.cjs                                        */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const base = path.join(__dirname, 'assets', 'js');
const win = {};
win.window = win;
win.TextEncoder = require('util').TextEncoder;
win.console = console;
win.document = undefined;
const store = {};
win.localStorage = {
  getItem: (k) => (store[k] === undefined ? null : store[k]),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; }
};
const ctx = vm.createContext(win);
['sha256.js', 'data.js', 'metta.js', 'kb.js', 'memory.js', 'protocol.js', 'charts.js', 'audit.js']
  .forEach((f) => vm.runInContext(fs.readFileSync(path.join(base, f), 'utf8'), ctx, { filename: f }));

const M = win.MedVerdictMemory;
const D = win.MedVerdictData;
let fail = 0;
const ok = (c, m) => { if (!c) { console.log('  FAIL: ' + m); fail++; } else console.log('  ok: ' + m); };
const c1 = D.CASES[0];

/* --- 1. the exact record shape that crashed boot: flagId missing --- */
store['medverdict.omega-memory.v1'] = JSON.stringify({
  adjudications: [
    { id: 'MEM-001', condition: c1.condition, label: 'Autoimmune disease', short: 'Autoimmune disease',
      rationale: 'r', at: new Date().toISOString(), rules: [] },              // <- no flagId
    { id: 'MEM-002', condition: c1.condition, flagId: 'veto:LVX-9', label: 'V', rationale: 'r', rules: [] }
  ],
  precedents: [], sessions: 1, log: []
});
const st = M.state();
ok(Array.isArray(st.adjudications) && st.adjudications.length === 2, 'malformed record still readable from state()');

/* the app does: persisted.filter(p => typeof p.flagId === 'string' && p.flagId.indexOf('veto:') === 0) */
const vetoes = st.adjudications.filter((p) => p && typeof p.flagId === 'string' && p.flagId.indexOf('veto:') === 0);
ok(vetoes.length === 1, 'veto filter is total (no throw on undefined flagId)');

/* the old code path: p.flagId.indexOf(...) */
let threw = false;
try { st.adjudications.filter((p) => p.flagId.indexOf('veto:') === 0); } catch (e) { threw = true; }
ok(threw, 'old unguarded filter DOES throw (confirming this was the boot crash)');

/* --- 2. persists flagId when stamped, and reloads cleanly --- */
store['medverdict.omega-memory.v1'] = undefined;
delete store['medverdict.omega-memory.v1'];
const KB = win.MedVerdictKB;
M.persistAdjudication(c1, Object.assign({ flagId: 'autoimmune' }, KB.ADJUDICATIONS.autoimmune));
M.persistAdjudication(c1, Object.assign({ flagId: 'veto:LVX-9' }, KB.vetoAdjudication('LVX-9')));
const reloaded = M.state();
ok(reloaded.adjudications.every((a) => typeof a.flagId === 'string' && a.flagId.length),
   'every persisted record carries a string flagId');
ok(reloaded.adjudications.filter((p) => p.flagId.indexOf('veto:') === 0).length === 1,
   'veto records survive the reload and are findable');
ok(M.recall(c1).adjudications.length === 2, 'recall finds both adjudications for this condition');

/* --- 3. diffing still works with a veto present --- */
const d = M.diffRules(c1, ['veto:LVX-9']);
ok(d.A.added.length > 0 && d.B.added.length > 0, 'veto injects rules into both bases from a stored record');

/* --- 4. corrupt JSON must not break state() --- */
store['medverdict.omega-memory.v1'] = '{not json';
let s2 = null, threw2 = false;
try { s2 = M.state(); } catch (e) { threw2 = true; }
ok(!threw2 && s2 && Array.isArray(s2.adjudications), 'corrupt localStorage falls back to blank state');
store['medverdict.omega-memory.v1'] = 'null';
let threw3 = false, s3 = null;
try { s3 = M.state(); } catch (e) { threw3 = true; }
ok(!threw3 && s3 && Array.isArray(s3.adjudications), 'null localStorage falls back to blank state');

/* --- 5. engine still clean after all of that --- */
delete store['medverdict.omega-memory.v1'];
const res = win.MedVerdictProtocol.run(c1, { flags: [] }, M.recall(c1));
ok(win.MedVerdictAudit.verifyChain(res.steps).ok, 'hash chain intact');
ok(res.steps.length >= 20, 'transcript still complete (' + res.steps.length + ' steps)');

/* ------------------------------------------------------------------ *
 * 10. Layout regressions found by measuring the live page
 *
 * Both shipped silently and neither is visible from reading the source:
 *   - `.stream` is a column FLEX container with a max-height, so every step was
 *     flex-shrunk to a ~10px hairline instead of overflowing into the scroll.
 *     The transcript - the centrepiece of the demo - rendered as stacked lines.
 *   - `.section-dark` sets a pale `color` that inherited onto the WHITE panels
 *     inside it, putting panel titles at 1.17:1 and ATLAS/NOVA at 1.32:1.
 * Asserted here against the stylesheet, because that is where the fix lives.
 * ------------------------------------------------------------------ */
console.log('\n=== layout regressions ===');
{
  const css = fs.readFileSync(path.join(base, '..', 'css', 'theme.css'), 'utf8');

  ok(/\.step\s*\{[^}]*flex:\s*none/.test(css),
     '.step sets flex:none so steps cannot be flex-shrunk to hairlines');
  ok(/\.stream\s*\{[^}]*max-height/.test(css),
     '.stream keeps its max-height (so the flex:none above is required)');
  ok(/\.stream\s*\{[^}]*flex-direction:\s*column/.test(css),
     '.stream is a column flex container, which is why that fix is needed');

  ok(/\.section-dark \.panel-hd h3\s*\{\s*color:\s*var\(--ink-900\)/.test(css),
     'panel headings are dark, not the pale dark-section colour');
  ok(!/\.section-dark \.panel-hd h3\s*\{\s*color:#/.test(css),
     'no hardcoded pale colour left on panel headings');
  ok(!/\.section-dark \.panel-hd\{[^}]*background:rgba\(255,255,255/.test(css),
     'panel headers are no longer forced to 3% white over a white card');
  ok(/\.section-dark \.panel,/.test(css) && /color:var\(--ink-800\)/.test(css),
     'the pale section colour is reset at the white panel boundary');

  /* Contrast floors for the ramp steps that were below AA on white. */
  const token = (name) => {
    const m = new RegExp('--' + name + ':\\s*(#[0-9A-Fa-f]{6})').exec(css);
    return m ? parseInt(m[1].slice(1), 16) : null;
  };
  const lum = (hex) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f((hex >> 16) & 255) + 0.7152 * f((hex >> 8) & 255) + 0.0722 * f(hex & 255);
  };
  ['muted', 'muted-2', 'hope-600', 'hope-700', 'ink-800', 'ink-900'].forEach((name) => {
    const h = token(name);
    const r = h === null ? 0 : 1.05 / (lum(h) + 0.05);
    ok(r >= 4.5, '--' + name + ' clears 4.5:1 on white (' + r.toFixed(2) + ':1)');
  });

  /* And the Superman palette itself, so a future re-hue cannot silently
     reintroduce the old teal. */
  ['FFC72C', 'F0322A', '2E7BE8'].forEach((hex) => {
    ok(css.toUpperCase().includes('#' + hex), 'Superman token #' + hex + ' is present');
  });
}
console.log('\n' + (fail ? '✗ ' + fail + ' FAILURES' : '✓ ALL PASS'));
process.exit(fail ? 1 : 0);
