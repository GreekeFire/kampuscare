// `node test.js`: checks the crisis filter and that every knowledge-base entry is complete.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { cleanFeedback, knowledge, toCards, validMedia, checkerInput, cleanCheck, contain } from './api/chat.js';
import { isCrisis, CRISIS, saveQueue, getQueue } from './lib/shared.js';
import { cleanEntry, cleanFlags } from './api/review.js';
import { toPlan, programmeContact } from './api/plan.js';
import { checkEmail, checkDate, checkTime, mailto, buildIcs, runTool } from './api/act.js';

for (const s of ['I want to kill myself', 'thinking about suicide', "I don't want to live anymore", '我想自杀', '我不想活了', 'saya mau bunuh diri', 'I want to end it all'])
  assert(isCrisis(s), `should flag: ${s}`);
for (const s of ['how do I send my assignment', 'this exam will kill me lol', 'when does the term end', 'I feel stressed about exams', "i'm a bit stressed", 'so tired and overwhelmed', 'I feel lonely here', 'dying to know my results','how to withdraw from a module'])
  assert(!isCrisis(s), `should NOT flag: ${s}`);

const fb = cleanFeedback({ feedback: 'down', reason: 'hacked', comment: 'x'.repeat(500), message: 'secret question', ids: ['a', 'b', 'c', 'd'] });
assert(fb.reason === undefined && fb.comment.length === 200 && fb.ids.length === 3 && !('message' in fb), 'feedback sanitised');
assert(cleanFeedback({ feedback: 'down', reason: 'incorrect' }).reason === 'incorrect', 'allowed reason kept');

// Photo / voice validation at the trust boundary.
for (const t of ['jpeg', 'png', 'webp']) assert(validMedia('image', `data:image/${t};base64,iVBORw0KGgo=`), `accepts ${t}`);
for (const v of ['data:image/gif;base64,R0lGOD', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:text/html;base64,PGI+', 'https://evil.com/a.png', 'iVBORw0KGgo=',
  'data:image/png;base64,abc<script>', `data:image/jpeg;base64,${'A'.repeat(4_000_000)}`, 42, {}])
  assert(!validMedia('image', v), `rejects image: ${String(v).slice(0, 40)}`);
assert(validMedia('audio', 'data:audio/wav;base64,UklGRg==') && !validMedia('audio', 'data:audio/webm;base64,GkXf') && !validMedia('audio', `data:audio/wav;base64,${'A'.repeat(1_300_000)}`), 'audio: wav only, ~30 s cap');

const kb = JSON.parse(readFileSync(new URL('./knowledge.json', import.meta.url), 'utf8'));
const ids = new Set();
for (const e of kb) {
  for (const k of ['id', 'group', 'title', 'title_zh', 'summary', 'steps', 'contact', 'source', 'reviewed']) assert(String(e[k] ?? '').trim(), `${e.id}: missing ${k}`);
  assert(!ids.has(e.id), `duplicate id ${e.id}`);
  ids.add(e.id);
}
// Plan: unknown ids dropped, contact/source/date from knowledge.json, invented links stripped.
const plan = toPlan({
  profile: { programme: 'Murdoch University degree', under18: true, studentPass: 'yes', extra: 'x' },
  sections: [
    { title: 'Before you fly', items: [{ id: 'new-international', task: 'Book pickup', due: '2026-11-13', contact: 'fake@evil.com', source: 'https://evil.com' }, { id: 'made-up', task: 'x' }] },
    { title: 'Week 1', items: [{ id: 'lms', task: 'Log in at https://moodleprod.murdoch.edu.au/my/ or https://fake-lms.com/login.' }] },
    { title: 'Week 2', items: [{ id: 'nope' }] },
  ],
  missing: ['SIM card'],
});
assert.deepStrictEqual(plan.sections.map((s) => s.items.map((i) => i.id)), [['new-international'], ['lms']], 'unknown ids and empty sections dropped');
const pick = plan.sections[0].items[0], kbPick = kb.find((e) => e.id === 'new-international');
assert(pick.contact === kbPick.contact && pick.source === kbPick.source && pick.reviewed === kbPick.reviewed, 'contact/source/date from KB');
assert(plan.sections[1].items[0].task.includes('https://moodleprod.murdoch.edu.au/my/') && !plan.sections[1].items[0].task.includes('fake-lms'), 'unknown links stripped');
assert(plan.profile.studentPass === null && !('extra' in plan.profile) && plan.profile.under18 === true, 'profile cleaned');
assert(plan.contact.line.startsWith('Murdoch') && programmeContact('Kaplan Diploma in IT').startsWith('Kaplan Diploma'), 'programme contact');
assert(programmeContact('UCD part-time Bachelor of Business Studies').includes('ucd-ptdegree'), 'UCD part-time line');
assert(programmeContact('Northumbria University nursing top-up').includes('ntb-scdegree'), 'Northumbria nursing line, not business');
assert(programmeContact('Northumbria Global Business Management').includes('ntb-buzdegree'), 'Northumbria business line');
assert(programmeContact('CFA with Kaplan Financial').includes('6496 5658'), 'Kaplan Financial CFA line');
for (const e of kb.filter((e) => e.group === 'Contacts' && e.id !== 'student-services-contacts')) // overview lists phones only
  assert(/\b\d{4} ?\d{4}\b/.test(e.steps.join(' ')) && e.steps.join(' ').includes('@kaplan.com'), `${e.id}: needs a phone and a @kaplan.com email`);
assert(programmeContact(null).includes('6733 1877') && toPlan({}).sections.length === 0, 'empty model output is safe');

// Review queue: server-side flags, entry validation, and only approved answers reach chat.
const flagNames = (fl) => fl.map((f) => f.flag).sort();
let fl = cleanFlags([{ flag: 'conflicts_with:not-real', reason: 'x', confidence: 90 }, { flag: 'conflicts_with:counselling', reason: 'differs', confidence: 250 }, { flag: 'made_up' }],
  'Printing costs 10 cents a page.', 'how do I print?', {});
assert.deepStrictEqual(flagNames(fl), ['conflicts_with:counselling', 'no_source'], 'unknown conflict dropped, no_source added');
assert(fl.find((f) => f.flag === 'conflicts_with:counselling').confidence === 100, 'confidence clamped');
fl = cleanFlags([], 'See https://kaplan.edu.sg/x. Withdrawal needs a form.', 'how do I leave my course', {});
assert.deepStrictEqual(flagNames(fl), ['policy_sensitive'], 'policy keyword flagged, URL means no no_source');

assert(cleanEntry({ title: '', steps: ['a'] }).error && cleanEntry({ title: 'Print', steps: [' ', ''] }).error, 'title and a step required');
const ce = cleanEntry({ title: '  Print on campus ', steps: 'Go to library\n\nTap card', source: 'javascript:alert(1)', notes: 'n'.repeat(900) });
assert(!ce.error && ce.entry.title === 'Print on campus' && ce.entry.steps.length === 2 && ce.entry.source === '' && ce.entry.notes.length === 500 && ce.entry.contact, 'entry cleaned');

await saveQueue([
  { id: 'p1', question: 'pending?', status: 'pending', created: '2026-11-01T00:00:00Z' },
  { id: 'r1', question: 'rejected?', status: 'rejected', created: '2026-11-01T00:00:00Z' },
  { id: 'a1', question: 'print?', status: 'approved', created: '2026-11-01T00:00:00Z', decided: '2026-11-02', entry: { ...ce.entry, group: 'Approved by Student Services' } },
]);
const merged = await knowledge();
assert(merged.byId['approved-a1'] && !merged.byId['approved-p1'] && !merged.byId['approved-r1'] && merged.kb.length === kb.length + 1, 'only approved entries merged');
const [card] = toCards([{ id: 'approved-a1', why: 'w' }], merged.byId);
assert(card.approved === true && card.reviewed === '2026-11-02', 'approved card badge data');
const [zhCard, zhApproved] = toCards([{ id: 'counselling' }, { id: 'approved-a1' }], merged.byId, 'zh');
assert(zhCard.title === kb[0].title_zh && zhApproved.title === 'Print on campus', 'zh card titles: title_zh, approved entries keep English');
assert(toCards([{ id: 'counselling' }], merged.byId, 'xx')[0].title === kb[0].title, 'unknown lang falls back to English title');
await saveQueue([]);

// Make It Fail: checker input, verdict normalising, containment.
const leaveKb = kb.find((e) => e.id === 'leave');
const bad = toCards([{ id: 'leave', why: 'w', steps: ['Open Kaplan360.', 'Submit within 10 working days.'], notes: 'n' }, { id: 'counselling', why: 'c', steps: ['ok'] }], merged.byId);
const ci = checkerInput('Hi', bad, merged.byId);
assert(ci.reply === 'Hi' && ci.answers.length === 2 && ci.answers[0].answer.steps[1].includes('10') && String(ci.answers[0].kb.steps) === String(leaveKb.steps) && !('source' in ci.answers[0].kb), 'checker input: only matched entries');
for (const g of [undefined, null, 'garbage', {}, { ok: 'nope' }, { ok: false }, { ok: false, problems: 'x' }, { ok: false, problems: [{ id: 'made-up', field: 'steps[0]' }] }])
  assert.deepStrictEqual(cleanCheck(g, ['leave']), { ok: true, problems: [] }, `garbage passes: ${JSON.stringify(g)}`);
const verdict = cleanCheck({ ok: false, problems: [{ id: 'leave', field: 'steps[1]', wrong: '10 working days', kb_says: '5 working days', reason: 'r' }, { id: 'nope', field: 'notes' }] }, ['leave', 'counselling']);
assert(cleanCheck({ ok: false, problems: [{ id: 'leave', field: 'reply', type: 'dropped' }, { id: 'leave', field: 'why', type: 'dropped' }] }, ['leave']).ok, 'omissions in reply/why ignored');
assert(!cleanCheck({ ok: false, problems: [{ id: 'leave', field: 'notes', type: 'dropped' }] }, ['leave']).ok, 'dropped caveat in notes kept');
assert(!verdict.ok && verdict.problems.length === 1 && verdict.problems[0].kb_says === '5 working days', 'unknown ids dropped');
const held = contain('Hi', bad, verdict.problems, merged.byId);
assert(String(held.cards[0].steps) === String(leaveKb.steps) && held.cards[0].notes === leaveKb.notes && held.cards[0].why === '' && held.cards[1].steps[0] === 'ok' && held.reply === 'Hi', 'bad card back to KB steps, good card kept');
const noReply = contain('Call 9999', bad, [{ id: 'leave', field: 'reply' }], merged.byId);
assert(noReply.reply === '' && noReply.cards[0].steps[1].includes('10'), 'bad reply dropped, cards kept');

// Make It Act: tool-arg validators, .ics and mailto builders.
assert(checkEmail('Merlinda.Tan@kaplan.com').team.id === 'contact-murdoch', 'KB email accepted, mapped to its Contacts team');
for (const bad of ['someone@gmail.com', 'merlinda.tan@kaplan.com.evil.com', '', undefined]) assert.throws(() => checkEmail(bad), `rejects email: ${bad}`);
assert(checkDate('2026-11-05', '2026-11-02') === '2026-11-05' && checkDate('2027-11-02', '2026-11-02'), 'date within 12 months');
for (const bad of ['2026-11-01', '2027-11-03', '2026-02-30', '5 Nov', '2026-11-5', null]) assert.throws(() => checkDate(bad, '2026-11-02'), `rejects date: ${bad}`);
assert(checkTime('09:30') === '09:30' && checkTime(undefined) === '', 'time HH:MM or empty');
assert.throws(() => checkTime('9pm'), 'rejects time 9pm');
await assert.rejects(runTool('draft_email', { to: 'kfd.sg@kaplan.com', subject: 'x'.repeat(151), body: 'b' }), /too long/, 'subject length');
await assert.rejects(runTool('draft_email', { to: 'kfd.sg@kaplan.com', subject: 's', body: ' ' }), /required/, 'empty body');
await assert.rejects(runTool('make_checklist', { title: 't', items: Array(11).fill('x') }), /1 to 10/, 'checklist cap');
await assert.rejects(runTool('draft_email', { to: 'kfd.sg@kaplan.com', subject: 's', body: 'ID S1234567A' }, { question: 'help' }), /NRIC/, 'invented ID rejected');
await assert.rejects(runTool('delete_everything', {}), /Unknown tool/, 'unknown tool');
const em = await runTool('draft_email', { to: 'merlinda.tan@kaplan.com', subject: 'Leave & MC?', body: 'Hi,\\nI am sick.' }, { lang: 'zh' });
assert(em.team === 'Murdoch University 学生服务' && em.body === 'Hi,\nI am sick.', 'zh team name, double-escaped newline fixed');
assert(mailto('a@kaplan.com', 'Leave & MC?', 'Hi,\n我病了 #1') === 'mailto:a@kaplan.com?subject=Leave%20%26%20MC%3F&body=Hi%2C%0D%0A%E6%88%91%E7%97%85%E4%BA%86%20%231', 'mailto encoding, CRLF line breaks');
const ics = buildIcs({ title: 'Submit MC; on Kaplan360, now', date: '2026-12-31', time: '', notes: '提交病假单'.repeat(20) + '\nline 2' }, new Date('2026-11-02T01:02:03Z'));
assert(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'), 'ics wrapper, CRLF');
assert(ics.includes('DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101') && ics.includes('DTSTAMP:20261102T010203Z'), 'all-day dates, rolls over the year');
assert(ics.includes('SUMMARY:Submit MC\\; on Kaplan360\\, now') && ics.replace(/\r\n /g, '').includes('\\nline 2'), 'ics text escaped');
assert(ics.split('\r\n').every((l) => Buffer.byteLength(l) <= 75), 'lines folded to 75 octets');
assert(buildIcs({ title: 't', date: '2026-11-05', time: '09:30' }).includes('DTSTART:20261105T093000\r\nDURATION:PT30M'), 'timed reminder');
const q = await runTool('send_to_student_services', { question: 'Can I bring my dog?' });
assert(q.queued && (await getQueue()).at(-1).question === q.question, 'queued via review.js');
await assert.rejects(runTool('send_to_student_services', { question: 'x'.repeat(301) }), /too long/, 'queue question max 300');
await saveQueue([]);

// Wellbeing: index.html stays one file, so run its marked pure block here.
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const [from, to] = [html.indexOf('// wellbeing:pure-start'), html.indexOf('// wellbeing:pure-end')];
assert(from > 0 && to > from, 'wellbeing pure block markers');
const { CRISIS_CLIENT, SENIORS, matchSeniors, homeCountry, PATTERN, ROUNDS } = new Function(html.slice(from, to) + 'return { CRISIS_CLIENT, SENIORS, matchSeniors, homeCountry, PATTERN, ROUNDS };')();
assert.deepStrictEqual(PATTERN, [['in', 4], ['hold', 2], ['out', 6]], 'breathe in 4, hold 2, out 6');
assert(PATTERN.reduce((s, [, n]) => s + n, 0) === 12 && ROUNDS === 5, '12 s a round, 5 rounds');
for (const k of ['tips', 'feelReply']) assert((html.match(new RegExp(`\\b${k}: [\\[{]`, 'g')) || []).length === 2, `${k} in en and zh`);
assert(CRISIS_CLIENT.source === CRISIS.source && CRISIS_CLIENT.flags === CRISIS.flags, 'client crisis regex matches lib/shared.js');
assert(SENIORS.length >= 12 && SENIORS.length <= 16, '12-16 sample seniors');
const people = [
  { name: 'A', field: 'it', country: 'cn' }, { name: 'B', field: 'business', country: 'cn' }, { name: 'C', field: 'business', country: 'vn' },
  { name: 'D', field: 'business', country: 'sg' }, { name: 'E', field: 'business', country: 'vn' }, { name: 'F', field: 'business', country: 'in' },
];
assert.deepStrictEqual(matchSeniors(people, 'business', 'vn').map((s) => s.name), ['C', 'E', 'B'], 'field+country first, then field only, max 3');
assert.deepStrictEqual(matchSeniors(people, 'business', 'other').map((s) => s.name), ['B', 'C', 'D'], 'field only when no country match');
assert.deepStrictEqual(matchSeniors(people, 'law', 'cn'), [], 'no field match: empty list');
assert.deepStrictEqual(matchSeniors(people, 'it', 'cn', true).map((s) => s.name), ['A', 'B'], 'buddy: same country only, same field first');
assert.deepStrictEqual(matchSeniors(people, 'it', 'my', true), [], 'buddy: no one from that country');
const names = { vn: 'Vietnam', cn: 'China', in: 'India', id: 'Indonesia', other: 'Other' };
assert(homeCountry('Vietnam, Vietnamese', names) === 'vn' && homeCountry('Chinese', names) === 'cn' && homeCountry('Indonesian', names) === 'id', 'home text to country');
assert(homeCountry(null, names) === 'other' && homeCountry('Kenya', names) === 'other', 'unknown home: other');
assert(matchSeniors(SENIORS, 'business', 'vn')[0].name === 'Linh' && matchSeniors(SENIORS, 'law', 'sg').length === 0, 'real sample data');
assert((html.match(/noMatch: '/g) || []).length === 2, 'friendly no-match message in en and zh');

console.log(`ok: crisis filter, plan filter, review queue, make-it-fail checker, make-it-act tools, wellbeing matching + ${kb.length} knowledge entries`);
