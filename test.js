// `node test.js`: checks the crisis filter and that every knowledge-base entry is complete.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { isCrisis } from './api/chat.js';

for (const s of ['I want to kill myself', 'thinking about suicide', "I don't want to live anymore", '我想自杀', '我不想活了', 'saya mau bunuh diri', 'I want to end it all'])
  assert(isCrisis(s), `should flag: ${s}`);
for (const s of ['how do I send my assignment', 'this exam will kill me lol', 'when does the term end', 'I feel stressed about exams', "i'm a bit stressed", 'so tired and overwhelmed', 'I feel lonely here', 'dying to know my results','how to withdraw from a module'])
  assert(!isCrisis(s), `should NOT flag: ${s}`);

const kb = JSON.parse(readFileSync(new URL('./knowledge.json', import.meta.url), 'utf8'));
const ids = new Set();
for (const e of kb) {
  for (const k of ['id', 'group', 'title', 'summary', 'steps', 'contact', 'source', 'reviewed']) assert(e[k], `${e.id}: missing ${k}`);
  assert(!ids.has(e.id), `duplicate id ${e.id}`);
  ids.add(e.id);
}
console.log(`ok: crisis filter + ${kb.length} knowledge entries`);
