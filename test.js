// `node test.js`: checks the crisis filter and that every knowledge-base entry is complete.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { cleanFeedback } from './api/chat.js';
import { isCrisis } from './lib/shared.js';
import { toPlan, programmeContact } from './api/plan.js';

for (const s of ['I want to kill myself', 'thinking about suicide', "I don't want to live anymore", '我想自杀', '我不想活了', 'saya mau bunuh diri', 'I want to end it all'])
  assert(isCrisis(s), `should flag: ${s}`);
for (const s of ['how do I send my assignment', 'this exam will kill me lol', 'when does the term end', 'I feel stressed about exams', "i'm a bit stressed", 'so tired and overwhelmed', 'I feel lonely here', 'dying to know my results','how to withdraw from a module'])
  assert(!isCrisis(s), `should NOT flag: ${s}`);

const fb = cleanFeedback({ feedback: 'down', reason: 'hacked', comment: 'x'.repeat(500), message: 'secret question', ids: ['a', 'b', 'c', 'd'] });
assert(fb.reason === undefined && fb.comment.length === 200 && fb.ids.length === 3 && !('message' in fb), 'feedback sanitised');
assert(cleanFeedback({ feedback: 'down', reason: 'incorrect' }).reason === 'incorrect', 'allowed reason kept');

const kb = JSON.parse(readFileSync(new URL('./knowledge.json', import.meta.url), 'utf8'));
const ids = new Set();
for (const e of kb) {
  for (const k of ['id', 'group', 'title', 'summary', 'steps', 'contact', 'source', 'reviewed']) assert(e[k], `${e.id}: missing ${k}`);
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
assert(programmeContact(null).includes('6733 1877') && toPlan({}).sections.length === 0, 'empty model output is safe');

console.log(`ok: crisis filter, plan filter + ${kb.length} knowledge entries`);
