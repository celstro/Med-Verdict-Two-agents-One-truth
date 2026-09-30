/* Ingestion tests — formats, coercion, and the never-guess-silently rule. */
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const base = path.join(__dirname, 'assets', 'js');
const win = {}; win.window = win; win.TextEncoder = require('util').TextEncoder; win.console = console;
const store = {};
win.localStorage = { getItem:(k)=>store[k]??null, setItem:(k,v)=>{store[k]=String(v);}, removeItem:(k)=>{delete store[k];} };
win.document = undefined;
const ctx = vm.createContext(win);
['sha256.js','data.js','metta.js','kb.js','ingest.js','memory.js','protocol.js','charts.js','audit.js']
  .forEach(f => vm.runInContext(fs.readFileSync(path.join(base,f),'utf8'), ctx, {filename:f}));

const I = win.MedVerdictIngest, D = win.MedVerdictData, P = win.MedVerdictProtocol, M = win.MedVerdictMemory, A = win.MedVerdictAudit;
let fail = 0;
const ok = (c,m) => { if(!c){console.log('  FAIL: '+m); fail++;} else console.log('  ok: '+m); };

/* ---------- 1. JSON, the exact template shape ---------- */
console.log('\n=== JSON template ===');
let r = I.parse('case.json', I.template());
ok(r.ok, 'parses: ' + (r.ok ? r.cases.length + ' case' : r.errors.join('; ')));
let c = r.cases[0];
ok(c.condition === 'stage-3b-nsclc', 'condition mapped → ' + c.condition);
ok(c.patient.ecog === 2 && c.patient.sex === 'male', 'ecog + sex coerced');
ok(c.patient.renal === 'moderate', 'renal enum → ' + c.patient.renal);
ok(c.patient.biomarkers.indexOf('pdl1-high') > -1, 'biomarkers parsed');
ok(c.patient._cyp3a4 === true, 'CYP3A4 interaction detected from amiodarone');
ok(c.labs.length >= 2, 'labs parsed (' + c.labs.length + ')');
ok(c.history.length === 2, 'history preserved (' + c.history.length + ' lines)');

console.log('\n  -- runs through the real protocol --');
ok(P.run(c, {flags:[]}, {precedents:[],adjudications:[],records:0,bonus:0}).steps.length >= 20, 'imported case produces a full transcript');

/* ---------- 2. messy key spellings ---------- */
console.log('\n=== JSON with messy keys ===');
r = I.parse('x.json', JSON.stringify({
  'Case No':'USR-77','Primary Diagnosis':'metastatic colorectal carcinoma, KRAS G12C',
  'Patient Age':'62','ECOG PS':'3','Renal Function':'normal','Liver Function':'Child-Pugh B',
  'Goal of care':'palliative','Regular Medications':['furosemide','paracetamol'],
  'Molecular profile':['KRAS-G12C','BRAF-wt','MSI-low'],
  'Previous lines':['FOLFOX x8','cetuximab'],
  'Line of therapy':2
}));
ok(r.ok, 'parses with aliases');
c = r.cases[0];
ok(c.id === 'USR-77', 'aliased id → ' + c.id + ' (exact "Case No" key, value not taken as a title)');
ok(c.condition === 'mrc-egfr-res', 'alias diagnosis → ' + c.condition);
ok(c.patient.ecog === 3, 'aliased ecog → ' + c.patient.ecog);
ok(c.patient.hepatic === 'moderate', 'Child-Pugh B → ' + c.patient.hepatic);
ok(c.patient.goal === 'palliative', 'alias goal → ' + c.patient.goal);
ok(c.patient.priorTherapies.length === 2, 'prior therapies');
ok(c.imported === true, 'flagged imported');

/* ---------- 3. CSV ---------- */
console.log('\n=== CSV ===');
r = I.parse('cases.csv',
  'case_id,diagnosis,age,sex,ecog,renal,goal\n' +
  'USR-1,Relapsed refractory DLBCL post CAR-T,58,female,1,normal,curative\n' +
  'USR-2,Stage IIIB NSCLC,71,male,2,moderate,curative');
ok(r.ok, 'parses CSV: ' + (r.ok ? r.cases.length + ' rows' : r.errors.join(';')));
ok(r.cases[0].condition === 'rr-dlbcl', 'row 1 condition → ' + r.cases[0].condition);
ok(r.cases[1].patient.ecog === 2, 'row 2 ecog → ' + r.cases[1].patient.ecog);
ok(r.cases[0].id === 'USR-1' && r.cases[1].id === 'USR-2', 'both ids read');

/* ---------- 4. free-text note ---------- */
console.log('\n=== free-text note ===');
r = I.parse('note.txt',
  ['PATIENT NOTE',
   'Case ID: USR-9',
   'Age: 45   Sex: F',
   'ECOG: 0',
   'Diagnosis: Stage IIIB non-small cell lung cancer',
   'Renal: moderate',
   'Goal of care: palliative',
   'Biomarkers: PD-L1 high, EGFR wild-type',
   'Allergies: Penicillin (rash)',
   'Medications: amiodarone, metformin',
   'Labs: eGFR 38 low, ALT 1.2x ULN',
   'History:',
   'Atrial fibrillation on amiodarone.',
   'No documented autoimmune disease.'
  ].join('\n'));
ok(r.ok, 'parses free text: ' + (r.ok ? '' : r.errors.join(';')));
c = r.cases[0];
/* the case id must survive, not be replaced by the auto-generated one */
ok(c.id === 'USR-9', 'id → ' + c.id);
/* the note's first line is a document heading, not a clinical statement */
ok(/patient note/i.test(c.title), 'heading consumed as title, not history: ' + JSON.stringify(c.title));
ok(c.history.length === 1 && /autoimmune/i.test(c.history[0]),
   'only the real history line survives: ' + JSON.stringify(c.history));
/* two fields on one physical line must BOTH be read */
ok(c.id === 'USR-9', 'id from "Case ID: USR-9" → ' + c.id);
ok(c.patient.age === 45, 'age from a shared line → ' + c.patient.age);
ok(c.patient.sex === 'female', 'F on the SAME line → ' + c.patient.sex);
ok(c.patient.ecog === 0, 'ecog 0 preserved (not coerced to null) → ' + c.patient.ecog);
ok(c.condition === 'stage-3b-nsclc', 'diagnosis → ' + c.condition);
ok(c.patient.renal === 'moderate', 'renal → ' + c.patient.renal);
/* a list field must keep every comma-separated element */
ok(c.patient.biomarkers.length === 2 && c.patient.biomarkers.indexOf('pdl1-high') > -1
   && c.patient.biomarkers.indexOf('egfr-wt') > -1,
   'both biomarkers kept → ' + JSON.stringify(c.patient.biomarkers));
ok(c.patient.medications.length === 2, 'both medications → ' + JSON.stringify(c.patient.medications));
ok(c.patient.allergies.length > 0, 'allergies → ' + JSON.stringify(c.patient.allergies));
ok(c.patient._cyp3a4 === true, 'CYP3A4 from amiodarone');

/* ---------- 5. the negation guard must survive ingestion ---------- */
const neg = r.cases[0];
const negRun = P.run(neg, {flags:[]}, {precedents:[],adjudications:[],records:0,bonus:0});
ok(!negRun.an.A.candidates.some(x => x.prohibited), '"No documented autoimmune disease" did NOT trigger a gate');

/* ---------- 6. never guess silently ---------- */
console.log('\n=== never-guess-silently ===');
r = I.parse('sparse.json', JSON.stringify({ diagnosis: 'Stage IIIB NSCLC' }));
ok(r.ok, 'parses a near-empty file');
ok(r.cases[0].patient.ecog === null, 'ecog left null, not defaulted');
ok(r.warnings.some(w => /ECOG/.test(w)), 'warns that ECOG is required');
ok(r.warnings.some(w => /renal/i.test(w)), 'warns renal unrecognised');
ok(r.warnings.some(w => /goal of care/i.test(w)), 'warns goal unrecognised');

r = I.parse('unmapped.json', JSON.stringify({ diagnosis: 'Glioblastoma multiforme', age: 60, ecog: 1 }));
ok(r.cases[0].condition === null, 'unmapped condition → null');
ok(r.warnings.some(w => /outside/.test(w)), 'warns the indication is unsupported');
const noCond = P.run(r.cases[0], {flags:[]}, {precedents:[],adjudications:[],records:0,bonus:0});
/* an unmapped diagnosis must REFUSE, not guess and not merely score low */
ok(noCond.rec.verdict === 'INSUFFICIENT_DATA',
   'unmapped case refuses to rank (not a low score): ' + noCond.rec.verdict);
ok(noCond.rec.primary === null, 'no therapy is selected');
ok(noCond.rec.blockers.length > 0, 'the missing field is named: ' + noCond.rec.blockers[0]);
ok(noCond.steps.some((s) => /declined to argue|Gaps in the case file/.test(s.body)),
   'the refusal is stated in the transcript, not hidden');
ok(A.verifyChain(noCond.steps).ok, 'a refusal is still a sealed transcript');

/* ECOG selects the toxicity ceiling, so a case without one cannot be ranked */
const noEcog = P.run(I.parse('s.json', JSON.stringify({ diagnosis: 'Stage IIIB NSCLC', age: 60 })).cases[0],
  { flags: [] }, { precedents: [], adjudications: [], records: 0, bonus: 0 });
ok(noEcog.rec.verdict === 'INSUFFICIENT_DATA', 'missing ECOG also refuses: ' + noEcog.rec.verdict);
ok(/ECOG/.test(noEcog.rec.blockers.join(' ')), 'blocker names ECOG');

/* ecog 0 is a real clinical value and must NOT be mistaken for "missing" */
const ecog0 = P.run(I.parse('s.json', JSON.stringify({ diagnosis: 'Stage IIIB NSCLC', age: 60, ecog: 0 })).cases[0],
  { flags: [] }, { precedents: [], adjudications: [], records: 0, bonus: 0 });
ok(ecog0.rec.blockers.length === 0, 'ecog 0 counts as stated, not as missing');
ok(ecog0.rec.verdict !== 'INSUFFICIENT_DATA', 'ecog 0 produces a real verdict: ' + ecog0.rec.verdict);

/* ---------- 6b. alias self-shadowing ---------- */
console.log('\n=== alias resolution ===');
/* Every goal spelling a real file might use must resolve. An earlier revision
   dropped 'goal' and 'intent' from the alias list, and the substring fallback
   then matched the alias' own key and shadowed the real field. */
[['goal','palliative'],['goal_of_care','palliative'],['goals','curative'],
 ['intent','palliative'],['treatment_intent','palliative'],['Goal of Care','best supportive care']]
 .forEach(([k, v]) => {
   const o = { diagnosis: 'Stage IIIB NSCLC', age: 70, ecog: 2, renal: 'normal' };
   o[k] = v;
   const got = I.parse('a.json', JSON.stringify(o)).cases[0].patient.goal;
   ok(got !== null, 'key "' + k + '" → ' + got);
 });
ok(I.parse('a.json', JSON.stringify({ diagnosis: 'Stage IIIB NSCLC', ecog: 2, goal: 'comfort care' }))
     .cases[0].patient.goal === 'palliative', '"comfort care" maps to palliative');
ok(I.parse('a.json', JSON.stringify({ diagnosis: 'Stage IIIB NSCLC', ecog: 2, goal: 'curative intent' }))
     .cases[0].patient.goal === 'curative-intent', '"curative intent" is not clipped by a shorter key');
ok(I.parse('a.json', JSON.stringify({ diagnosis: 'Stage IIIB NSCLC', ecog: 2, goal: 'wat' }))
     .cases[0].patient.goal === null, 'an unreadable goal stays null rather than defaulting');
ok(I.parse('a.json', JSON.stringify({ diagnosis: 'Stage IIIB NSCLC', ecog: 2, goal: 'wat' }))
     .warnings.some(w => /goal of care/i.test(w)), 'unreadable goal is reported');

/* goal + ECOG 3 is the protocol §6.2 refusal path, driven entirely by imports */
const frail = I.parse('a.json', JSON.stringify({
  diagnosis: 'Stage IIIB non-small-cell lung cancer', age: 78, sex: 'female',
  ecog: 3, renal: 'severe', goal: 'palliative', biomarkers: ['PD-L1 high']
})).cases[0];
const frailRun = P.run(frail, { flags: [] }, { precedents: [], adjudications: [], records: 0, bonus: 0 });
ok(frailRun.rec.verdict === 'PALIATIVE',
   'imported frail+palliative case reaches the refusal: ' + frailRun.rec.verdict);
ok(frailRun.rec.confidence === 70, 'the ECOG>=3 cap applies: ' + frailRun.rec.confidence + '%');
ok(frailRun.rec.caps.some(c => /ECOG/.test(c)), 'the cap states its reason');

/* ---------- 7. failure modes are messages, not throws ---------- */
console.log('\n=== failure modes ===');
/* parse() is the untrusted-input boundary: it must never throw, whatever it is
   handed, because a throw would abort the caller's render path and kill the UI. */
[['{oops', 'json garbage'], ['a,b,c', 'csv header only'], ['"just a string"', 'json scalar'],
 ['[]', 'json empty array'], ['\x00\x01\x02', 'binary junk'], ['#'.repeat(5000), 'very long line'],
 ['eGFR', 'label with no colon']].forEach(([t, n]) => {
  let res = null, threw = false;
  try { res = I.parse(n, t); } catch (e) { threw = true; }
  ok(!threw, n + ' did not throw');
  ok(res && !res.ok && res.errors.length > 0, n + ' → "' + (res && res.errors[0] || 'NO ERROR') + '"');
});

/* ---------- 8. recorrect ---------- */
console.log('\n=== user correction ===');
const sparse = I.parse('s.json', JSON.stringify({ diagnosis: 'Stage IIIB NSCLC' })).cases[0];
let fixed = I.recorrect(sparse, { ecog: 1, condition: 'Stage IIIB NSCLC' });
ok(fixed.patient.ecog === 1, 'ecog corrected → ' + fixed.patient.ecog);
const before = P.run(sparse, {flags:[]}, {precedents:[],adjudications:[],records:0,bonus:0});
const after  = P.run(fixed,   {flags:[]}, {precedents:[],adjudications:[],records:0,bonus:0});
ok(before.seal !== after.seal, 'correcting one field changes the audit seal');
ok(fixed._warnings.length === 0 || !fixed._warnings.some(w=>/ECOG/.test(w)), 'ECOG warning cleared after correction');

/* ---------- 9. determinism of imported cases ---------- */
console.log('\n=== determinism ===');
const t = I.parse('case.json', I.template()).cases[0];
const s1 = P.run(t,{flags:[]},{precedents:[],adjudications:[],records:0,bonus:0}).seal;
const s2 = P.run(t,{flags:[]},{precedents:[],adjudications:[],records:0,bonus:0}).seal;
ok(s1 === s2, 'imported case is byte-reproducible: ' + s1.slice(0,12));

/* ---------- 10. audit export of an imported case ---------- */
const rr = P.run(t,{flags:[]},{precedents:[],adjudications:[],records:0,bonus:0});
ok(A.verifyChain(rr.steps).ok, 'imported case seals a valid chain');
ok(A.toMarkdown(rr).indexOf('USR-0001') > -1, 'export names the imported case');

/* ---------- 11. the .txt form must round-trip ---------- */
console.log('\n=== human-readable .txt form ===');
const form = I.templateText();
ok(/^#\s*=+/m.test(form) && /^#\s+MED-VERDICT\s+—\s+CASE FILE/m.test(form),
   'form opens with a plain-text comment header');
ok(!/^[A-Z]+:\s+\S/.test(form.split('\n').filter((l) => /e\.g\./.test(l)).join('\n')),
   'no example value sits on a parseable field line');
ok((form.match(/^#/gm) || []).length > 30, 'form is heavily commented: ' + (form.match(/^#/gm) || []).length + ' lines');

/* An untouched template must be REFUSED, never turned into a fabricated patient.
   Every value in it sits behind a "#", so nothing may be read from it. */
const blank = I.parse('form.txt', form);
ok(!blank.ok, 'the untouched blank form is refused, not ingested');
ok(/blank case form/i.test(blank.errors[0]),
   'the refusal names the cause: "' + blank.errors[0].slice(0, 70) + '…"');

/* a PARTIALLY filled form is ingested, and only the missing field is reported */
const partial = form
  .replace(/^DIAGNOSIS:.*$/m, 'DIAGNOSIS: Stage IIIB non-small-cell lung cancer');
const pp = I.parse('form.txt', partial);
ok(pp.ok, 'a form with only a diagnosis imports');
ok(pp.cases[0].condition === 'stage-3b-nsclc', 'diagnosis read → ' + pp.cases[0].condition);
ok(pp.cases[0].patient.ecog === null, 'ECOG still null, not borrowed from a comment (got ' + pp.cases[0].patient.ecog + ')');
ok(pp.cases[0].patient.age === null, 'age still null, not 71 from a comment (got ' + pp.cases[0].patient.age + ')');
ok(pp.cases[0].patient.renal === null, 'renal still null (got ' + pp.cases[0].patient.renal + ')');
ok(!/MED-VERDICT|e\.g\./.test(pp.cases[0].history.join(' ')), 'the form\'s instructions are not read as history');
ok(pp.warnings.some((w) => /ECOG/.test(w)), 'the missing ECOG is reported');
const ppRun = P.run(pp.cases[0], { flags: [] }, { precedents: [], adjudications: [], records: 0, bonus: 0 });
ok(ppRun.rec.verdict === 'INSUFFICIENT_DATA', 'a case missing ECOG refuses to rank: ' + ppRun.rec.verdict);

/* a FILLED-IN form, written the way a user would, must import and reason */
const filled = form
  .replace(/^CASE ID:.*$/m, 'CASE ID: USR-FORM-1')
  .replace(/^TITLE:.*$/m, 'TITLE: Frail locally advanced disease, on a CYP3A4 inhibitor')
  .replace(/^DIAGNOSIS:.*$/m, 'DIAGNOSIS: Stage IIIB non-small-cell lung cancer')
  .replace(/^AGE:.*$/m, 'AGE: 78   SEX: female   ECOG: 3   LINE: 2')
  .replace(/^GOAL OF CARE:.*$/m, 'GOAL OF CARE: palliative')
  .replace(/^RENAL:.*$/m, 'RENAL: severe   HEPATIC: mild')
  .replace(/^BIOMARKERS:.*$/m, 'BIOMARKERS: PD-L1 high, EGFR wild-type')
  .replace(/^MEDICATIONS:.*$/m, 'MEDICATIONS: amiodarone, atorvastatin')
  .replace(/^#   eGFR: 42 low$/m, 'eGFR: 24 low')
  .replace(/^#   ALT: 1.4x ULN high$/m, 'ALT: 2.1x ULN high')
  .replace(/^#     "atrial fibrillation on$/m, 'Atrial fibrillation on amiodarone, a potent CYP3A4 inhibitor.')
  .replace(/^#   "ECOG 3" \/ "primary resistance"$/m, 'ECOG 3, chair-bound most of the day.');

const ff = I.parse('filled.txt', filled);
ok(ff.ok, 'the filled form imports: ' + (ff.ok ? '' : ff.errors.join(';')));
const fc = ff.cases[0];
ok(fc.id === 'USR-FORM-1', 'form id read → ' + fc.id);
ok(fc.condition === 'stage-3b-nsclc', 'form diagnosis read → ' + fc.condition);
ok(fc.patient.ecog === 3, 'shared-line ECOG read → ' + fc.patient.ecog);
ok(fc.patient.sex === 'female', 'shared-line sex read → ' + fc.patient.sex);
ok(fc.patient.line === 2, 'shared-line line read → ' + fc.patient.line);
ok(fc.patient.goal === 'palliative', 'form goal read → ' + fc.patient.goal);
ok(fc.patient.renal === 'severe', 'form renal read → ' + fc.patient.renal);
ok(fc.patient.biomarkers.length === 2, 'form biomarkers → ' + JSON.stringify(fc.patient.biomarkers));
ok(fc.patient.medications.length === 2, 'form medications → ' + JSON.stringify(fc.patient.medications));
ok(fc.patient._cyp3a4 === true, 'CYP3A4 detected from the filled form');
ok(fc.labs.some((l) => /egfr/i.test(l.k) && /24/.test(l.v)), 'colon-style lab read → ' + JSON.stringify(fc.labs));
ok(/CYP3A4/.test(fc.history.join(' ')), 'narrative history read → ' + JSON.stringify(fc.history));

const ffRun = P.run(fc, { flags: [] }, { precedents: [], adjudications: [], records: 0, bonus: 0 });
ok(ffRun.rec.verdict === 'PALIATIVE', 'the filled form reaches the refusal path: ' + ffRun.rec.verdict);
ok(A.verifyChain(ffRun.steps).ok, 'filled form seals a valid chain');
ok(A.toMarkdown(ffRun).indexOf('USR-FORM-1') > -1, 'filled form is named in the export');

/* ---------- 12. bare lab lines without a colon ---------- */
console.log('\n=== lab formats ===');
[['eGFR: 42 low', 'colon'], ['eGFR 42 low', 'no colon'], ['eGFR 42', 'bare number']].forEach(([line, n]) => {
  const r = I.parse('l.txt', 'DIAGNOSIS: Stage IIIB NSCLC\nECOG: 2\nLABS:\n' + line);
  const got = r.ok ? r.cases[0].labs.filter((l) => /egfr/i.test(l.k))[0] : null;
  ok(!!got, n + ' lab form read → ' + (got ? got.k + '=' + got.v : 'nothing'));
});
ok(I.parse('l.txt', 'DIAGNOSIS: Stage IIIB NSCLC\nECOG: 2\nLABS:\n# eGFR: 42 low').cases[0].labs.length === 0,
   'commented-out lab lines are not ingested as data');

console.log('\n' + (fail ? '✗ ' + fail + ' FAILURES' : '✓ ALL PASS'));
process.exit(fail ? 1 : 0);
