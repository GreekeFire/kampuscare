// `node test.js`: checks the crisis filter and that every knowledge-base entry is complete.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { cleanFeedback, toCards, validMedia, kbMatch, busyAnswer } from './api/chat.js';
import { isCrisis, CRISIS, modelList, byId } from './lib/shared.js';
import { toPlan, programmeContact, cleanProfile } from './api/plan.js';

for (const s of ['I want to kill myself', 'thinking about suicide', "I don't want to live anymore", '我想自杀', '我不想活了', 'saya mau bunuh diri', 'I want to end it all'])
  assert(isCrisis(s), `should flag: ${s}`);
for (const s of ['ugh kms', 'KMS.', 'I want to unalive myself', 'I want to end myself', 'thinking of an overdose', 'gonna jump off the roof', '我想跳楼', '我想割腕', '我活不下去了'])
  assert(isCrisis(s), `should flag: ${s}`);
for (const s of ['bookmarks', 'I walked 5kms today', 'open the kmsg log', 'how do I switch campuses'])
  assert(!isCrisis(s), `kms only as a word: ${s}`);
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

const [zhCard] = toCards([{ id: 'counselling' }], byId, 'zh');
assert(zhCard.title === kb[0].title_zh, 'zh card titles: title_zh');
assert(toCards([{ id: 'counselling' }], byId, 'xx')[0].title === kb[0].title, 'unknown lang falls back to English title');
// Model output that isn't the expected shape never crashes the handler.
for (const g of [null, undefined, 'x', {}, [null, 42, { id: 'made-up' }]]) assert.deepStrictEqual(toCards(g, byId), [], `toCards safe on ${JSON.stringify(g)}`);
assert(cleanProfile(null).programme === null && toPlan(null).sections.length === 0 && toPlan({ profile: null, sections: null, missing: null }).missing.length === 0, 'null profile/plan safe');

// AI-busy fallback: keyword match, reply follows lang.
assert(kbMatch('how do I apply for leave? I have an MC', kb)[0].id === 'leave' && kbMatch('我想请假', kb)[0].id === 'leave', 'busy match en + zh');
assert(kbMatch('Book a counselling session', kb)[0].id === 'counselling', 'topic title');
assert(kbMatch('xyzzy', kb).length === 0 && kbMatch('', kb).length === 0 && kbMatch('contact email phone', kb).length === 3, 'no match empty, max 3');
const busy = busyAnswer('怎么预约心理辅导', kb, byId, 'zh');
assert(busy.busy && busy.reply.startsWith('AI') && busy.cards[0].title === kb[0].title_zh && busy.cards[0].contact === kb[0].contact, 'busy answer: zh reply, KB card');
assert(busyAnswer('apply for leave', kb, byId, 'en').reply.startsWith('The AI is busy') && busyAnswer('xyzzy', kb, byId, 'en') === null, 'busy answer: en, null when no match');

// Quota insurance: LLM_FALLBACK_MODEL can be a comma list.
assert.deepStrictEqual(modelList(undefined, undefined), ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'], 'default models');
assert.deepStrictEqual(modelList('m', ' a, ,b ,'), ['m', 'a', 'b'], 'comma list trimmed, empties dropped');

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

console.log(`ok: crisis filter, plan filter, busy fallback, wellbeing matching + ${kb.length} knowledge entries`);
