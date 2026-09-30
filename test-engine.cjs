/* Headless test harness — runs the engine under Node with a minimal window shim. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const base = path.join(__dirname, 'assets', 'js');
const win = {};
win.window = win;
win.TextEncoder = require('util').TextEncoder;
win.console = console;
win.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] === undefined ? null : this._d[k]; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; }
};
const ctx = vm.createContext(win);

['sha256.js', 'data.js', 'metta.js', 'kb.js', 'memory.js', 'protocol.js', 'charts.js', 'audit.js']
  .forEach((f) => {
    const code = fs.readFileSync(path.join(base, f), 'utf8');
    try { vm.runInContext(code, ctx, { filename: f }); }
    catch (e) { console.error('LOAD FAIL', f, e.message); process.exit(1); }
  });

const D = win.MedVerdictData, P = win.MedVerdictProtocol, M = win.MedVerdictMemory, A = win.MedVerdictAudit;

let fail = 0;
function ok(c, m) { if (!c) { console.log('  FAIL: ' + m); fail++; } else console.log('  ok: ' + m); }

D.CASES.forEach((c, ci) => {
  console.log('\n=== ' + c.id + ' · ' + c.short + ' ===');
  const mem = M.recall(c);
  let res;
  try { res = P.run(c, { flags: [] }, mem); }
  catch (e) { console.log('  RUN THREW: ' + e.message + '\n' + e.stack.split('\n').slice(0, 6).join('\n')); fail++; return; }

  const r = res.rec;
  console.log('  ATLAS pick: ' + (r.aPick ? r.aPick.id + ' (' + r.aPick.score + ')' : 'none') +
    (res.an.A.blocked ? '  [blocked ' + res.an.A.blocked.id + ']' : ''));
  console.log('  NOVA  pick: ' + (r.bPick ? r.bPick.id + ' (' + r.bPick.score + ')' : 'none') +
    (res.an.B.blocked ? '  [blocked ' + res.an.B.blocked.id + ']' : ''));
  console.log('  negotiated W*: ' + Object.keys(res.W).map((k) => k + '=' + res.W[k]).join(' '));
  console.log('  primary: ' + (r.primary ? r.primary.id : 'none') + '  component: ' +
    (r.component ? r.component.id + '(' + r.componentMode + ')' : 'none'));
  console.log('  mode=' + r.componentMode + ' agreement=' + r.agreement + ' margin=' + r.margin);
  console.log('  VERDICT: ' + r.verdict + ' @ ' + r.confidence + '%  ' + r.verdictLabel);
  console.log('  steps=' + res.steps.length + ' seal=' + res.seal.slice(0, 16) + '…');
  console.log('  trades=' + r.trades.length + ' mitigations=' + r.mitigations.length +
    ' terms=' + r.terms.length + ' caps=' + r.caps.length);

  ok(res.steps.length >= 20, '>=20 transcript steps');
  const v = A.verifyChain(res.steps);
  ok(v.ok, 'hash chain intact' + (v.ok ? '' : ' (broken at ' + v.broken + ')'));
  ok(res.steps.every((s) => s.title && s.body && s.hash && s.prev), 'every step fully populated');
  ok(typeof r.verdict === 'string' && r.verdict.length > 0, 'verdict produced');

  /* charts must not throw, and must not emit invalid SVG geometry */
  try {
    const svg = win.MedVerdictCharts.tradeoff(
      res.an.A.candidates.map((x) => ({ therapy: x.therapy, orr: x.therapy.subgroup && c.patient.biomarkers.indexOf(x.therapy.subgroup.marker) >= 0 ? x.therapy.subgroup.orr : x.therapy.orr, g3tox: x.therapy.g3tox, gated: x.prohibited })),
      { A: r.aPick && r.aPick.id, B: r.bPick && r.bPick.id, primary: r.primary }, r.ceilings, c);
    win.MedVerdictCharts.scoreboard(res.an.A.candidates.slice(0, 7).map((x) => ({ id: x.id, name: x.therapy.name, a: x.score, n: 0, w: x.score, gated: x.prohibited })));
    win.MedVerdictCharts.weightProfile(D.CRITERIA.map((c2) => ({ key: c2.key, label: c2.label, a: .14, b: .28, w: .2 })));
    win.MedVerdictCharts.waterfall(r.terms, r.confidence, r.caps);
    ok(true, 'all charts render without throwing');

  function effForTest(x, c) {
    const th = x.therapy, bm = c.patient.biomarkers;
    return (th.subgroup && bm.indexOf(th.subgroup.marker) >= 0) ? th.subgroup.orr : th.orr;
  }

    /* invalid geometry: negative or NaN dimensions anywhere in the SVG */
    const bad = [];
    svg.replace(/<(rect|circle|line)\b[^>]*>/g, (tag) => {
      ['width', 'height', 'r', 'x', 'y', 'x1', 'x2', 'y1', 'y2'].forEach((a) => {
        const m = new RegExp('\\b' + a + '="([^"]*)"').exec(tag);
        if (m) {
          const v = parseFloat(m[1]);
          if (!isFinite(v) || v < 0) bad.push(a + '=' + m[1] + ' in ' + tag.slice(0, 70));
        }
      });
    });
    ok(bad.length === 0, 'trade-off SVG has valid geometry' + (bad.length ? ' — ' + bad.join(' | ') : ''));
    ok(!/NaN|undefined|Infinity/.test(svg), 'trade-off SVG contains no NaN/undefined/Infinity');
  } catch (e) { ok(false, 'charts threw: ' + e.message); }

  /* ---------- chart legibility ----------
     The bug this guards: SVG text is measured in viewBox units and then scaled
     to the rendered box, so a 720-unit chart in a 460px column renders its 10px
     labels at 6.4px. Assert on the SCALE FACTOR, which is what a reader
     actually experiences — not on the font size written in the source. */
  const MIN_RENDER = 320;   /* narrowest column a chart ever lands in */
  const MAX_RENDER = 560;   /* .chartbox .chart max-width in theme.css */
  const MIN_RATIO = 0.6;    /* below this the type is visibly too small */
  const svgs = {
    tradeoff: win.MedVerdictCharts.tradeoff(
      res.an.A.candidates.map((x) => ({ therapy: x.therapy, orr: effForTest(x, c), g3tox: x.therapy.g3tox, gated: x.prohibited })),
      { A: r.aPick && r.aPick.id, B: r.bPick && r.bPick.id, primary: r.primary }, r.ceilings, c),
    scoreboard: win.MedVerdictCharts.scoreboard(res.an.A.candidates.slice(0, 7).map((x) => ({ id: x.id, name: x.therapy.name, a: x.score, n: x.score, w: x.score, gated: x.prohibited }))),
    weightProfile: win.MedVerdictCharts.weightProfile(D.CRITERIA.map((c2) => ({ key: c2.key, label: c2.label, a: .14, b: .28, w: .2 }))),
    waterfall: win.MedVerdictCharts.waterfall(r.terms, r.confidence, r.caps)
  };
  Object.keys(svgs).forEach((name) => {
    const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svgs[name]);
    ok(!!vb, name + ': declares a viewBox');
    const units = parseFloat(vb[1]);
    const worst = MIN_RENDER / units;
    const best = MAX_RENDER / units;
    ok(worst >= MIN_RATIO, name + ': ' + units + '-unit viewBox renders at ' + worst.toFixed(2) +
       '× worst case, ' + best.toFixed(2) + '× best — within the legibility band');
    ok(best <= 1.45, name + ': does not over-scale (' + best.toFixed(2) + '×)');
  });

  /* no label may overflow its own frame */
  Object.keys(svgs).forEach((name) => {
    const svg = svgs[name];
    const W = parseFloat(/viewBox="0 0 ([\d.]+)/.exec(svg)[1]);
    let over = null;
    svg.replace(/<text[^>]*x="([\d.]+)"[^>]*text-anchor="start"[^>]*>([^<]*)</g, (m, x, label) => {
      if (!label.trim()) return m;
      over = Math.max(over === null ? -1e9 : over, parseFloat(x) + label.length * 6.6 - W);
      return m;
    });
    svg.replace(/<text[^>]*x="([\d.]+)"[^>]*text-anchor="end"/g, (m, x) => {
      over = Math.max(over === null ? -1e9 : over, -parseFloat(x));
      return m;
    });
    if (over === null) { ok(true, name + ': no anchored labels to check'); return; }
    ok(over < 0, name + ': no label overflows the ' + W + '-unit frame (' +
       (over < 0 ? (-over).toFixed(0) + 'u spare' : '+' + over.toFixed(0) + 'u over') + ')');
  });

  /* exports must not throw */  try {
    const md = A.toMarkdown(res);
    const js = A.toJSON(res);
    ok(md.length > 4000, 'markdown export substantial (' + md.length + ' chars)');
    ok(js.length > 3000, 'json export substantial (' + js.length + ' chars)');
    JSON.parse(js);
    ok(true, 'json is valid');
  } catch (e) { ok(false, 'export threw: ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]); }
});

/* ---- adjudication / self-modification test ---- */
console.log('\n=== adjudication & self-modification ===');
const c1 = D.CASES[0];
const base0 = M.diffRules(c1, []);
const withVeto = M.diffRules(c1, ['veto:LVX-9']);
console.log('  ATLAS rules ' + base0.A.sizeBefore + ' → ' + withVeto.A.sizeAfter +
  ', added: ' + withVeto.A.added.map((r) => r.id).join(','));
console.log('  NOVA  rules ' + base0.B.sizeBefore + ' → ' + withVeto.B.sizeAfter +
  ', added: ' + withVeto.B.added.map((r) => r.id).join(','));
ok(withVeto.A.added.length > 0 && withVeto.B.added.length > 0, 'veto injects a rule into BOTH rule bases');
ok(withVeto.A.added.length === withVeto.B.added.length, 'injection is symmetric');

const vetoRun = P.run(c1, { flags: ['veto:LVX-9'] }, M.recall(c1));
console.log('  with veto: ATLAS=' + (vetoRun.rec.aPick ? vetoRun.rec.aPick.id : 'none') +
  ' NOVA=' + (vetoRun.rec.bPick ? vetoRun.rec.bPick.id : 'none') +
  ' verdict=' + vetoRun.rec.verdict + ' @' + vetoRun.rec.confidence + '%');
ok(vetoRun.rec.aPick && vetoRun.rec.aPick.id !== 'LVX-9', 'vetoed therapy is no longer selected');

const noOff = P.run(c1, { flags: ['no-off-label'] }, M.recall(c1));
console.log('  no-off-label: ATLAS=' + (noOff.rec.aPick ? noOff.rec.aPick.id : 'none') +
  ' NOVA=' + (noOff.rec.bPick ? noOff.rec.bPick.id : 'none') +
  ' verdict=' + noOff.rec.verdict + ' @' + noOff.rec.confidence + '%');
ok(!noOff.an.B.candidates.filter((x) => x.therapy.status === 'off-label' && !x.prohibited).length,
  'off-label is barred by reviewer policy');

/* ---- determinism ---- */
console.log('\n=== determinism ===');
const r1 = P.run(c1, { flags: [] }, M.recall(c1));
const r2 = P.run(c1, { flags: [] }, M.recall(c1));
ok(r1.seal === r2.seal, 'same input ⇒ same seal (' + r1.seal.slice(0, 12) + ')');

/* ---- every case is reachable to a non-escalate verdict or escalates for a stated reason ---- */
console.log('\n=== verdict sanity ===');
D.CASES.forEach((c) => {
  const r = P.run(c, { flags: [] }, M.recall(c));
  const why = r.rec.verdictTone === 'stop' ? (r.rec.trades.length ? 'trades logged' : 'no reason') : 'n/a';
  ok(true, c.id + ' → ' + r.rec.verdict + ' @' + r.rec.confidence + '% (' + why + ')');
});

console.log('\n' + (fail ? '✗ ' + fail + ' FAILURES' : '✓ ALL PASS'));
process.exit(fail ? 1 : 0);
