// Surprise feature 5, "Make It Act": the model picks tools (draft an email, add a reminder, queue for staff,
// make a checklist) and the server runs them. Nothing is sent or saved without the student tapping it,
// except send_to_student_services, which is the same opt-in queue as the "Send to Student Services" button.
import { randomUUID } from 'node:crypto';
import { KB, API_KEY, isCrisis, readBody, send, callTools } from '../lib/shared.js';
import { knowledge, pickLang, LANGS } from './chat.js';
import { enqueue } from './review.js';

// Only addresses that appear in knowledge.json, mapped to the team that owns them (Contacts entries first).
const TEAMS = new Map();
for (const e of [...KB.filter((e) => e.group === 'Contacts'), ...KB])
  for (const m of JSON.stringify(e).match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) || []) if (!TEAMS.has(m.toLowerCase())) TEAMS.set(m.toLowerCase(), e);

const sgToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' }); // YYYY-MM-DD
const NRIC = /\b[STFGM]\d{7}[A-Z]\b/i;
const text = (v, max, name) => {
  const s = String(v ?? '').trim();
  if (!s) throw new Error(`"${name}" is required.`);
  if (s.length > max) throw new Error(`"${name}" is too long (max ${max} characters).`);
  return s;
};

// Every check throws a message the model can act on; the loop feeds it back as the tool result.
export function checkEmail(to) {
  const e = TEAMS.get(String(to ?? '').trim().toLowerCase());
  if (!e) throw new Error(`"${to}" is not a Kaplan address in the knowledge base. Use one of: ${[...TEAMS.keys()].join(', ')}.`);
  return { to: String(to).trim().toLowerCase(), team: e };
}

export function checkDate(date, today = sgToday()) {
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(date ?? '') && !isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  const max = new Date(today); max.setUTCFullYear(max.getUTCFullYear() + 1);
  if (!ok || date < today || date > max.toISOString().slice(0, 10)) throw new Error(`"date" must be YYYY-MM-DD between ${today} and ${max.toISOString().slice(0, 10)}.`);
  return date;
}

export function checkTime(time) {
  if (time == null || time === '') return '';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('"time" must be HH:MM (24-hour) or left out.');
  return time;
}

// RFC 6068: line breaks are %0D%0A.
export const mailto = (to, subject, body) =>
  `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/\r?\n/g, '\r\n'))}`;

// RFC 5545 text escaping and 75-octet line folding (UTF-8 aware, so Chinese titles fold correctly).
const icsText = (s) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line) {
  let out = '', n = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (n + b > 75) { out += '\r\n '; n = 1; }
    out += ch; n += b;
  }
  return out;
}
// Floating local time: Singapore has no DST, and the student's phone is on Singapore time.
export function buildIcs({ title, date, time, notes }, now = new Date()) {
  const d = date.replace(/-/g, '');
  const next = new Date(Date.parse(date) + 864e5).toISOString().slice(0, 10).replace(/-/g, '');
  const when = time ? [`DTSTART:${d}T${time.replace(':', '')}00`, 'DURATION:PT30M'] : [`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`];
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//KampusCare//Make It Act//EN', 'BEGIN:VEVENT',
    `UID:${randomUUID()}@kampuscare`, `DTSTAMP:${now.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`, ...when,
    `SUMMARY:${icsText(title)}`, ...(notes ? [`DESCRIPTION:${icsText(notes)}`] : []),
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(title)}`, `TRIGGER:${time ? '-PT15M' : 'PT9H'}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].map(fold).join('\r\n') + '\r\n';
}

const TOOLS = [
  { name: 'draft_email', description: 'Draft an email from the student to a Kaplan team (e.g. a leave notice, an appeal, a question). The student reviews it and sends it from their own mail app; nothing is sent automatically.',
    parameters: { type: 'object', properties: {
      to: { type: 'string', description: 'An email address copied exactly from the knowledge base, for the right team.' },
      subject: { type: 'string' }, body: { type: 'string', description: 'Plain text. Use "[your name]" and "[student ID]" placeholders; never invent names, IDs or dates the student did not give.' } },
    required: ['to', 'subject', 'body'] } },
  { name: 'add_reminder', description: 'Create a calendar reminder the student can download (e.g. "Submit MC on Kaplan360", "Orientation day").',
    parameters: { type: 'object', properties: {
      title: { type: 'string' }, date: { type: 'string', description: 'YYYY-MM-DD, today or within the next 12 months.' },
      time: { type: 'string', description: 'Optional HH:MM, 24-hour, Singapore time.' }, notes: { type: 'string' } },
    required: ['title', 'date'] } },
  { name: 'send_to_student_services', description: "Queue the student's question for Student Services staff to answer. ONLY use this when the knowledge base cannot answer it.",
    parameters: { type: 'object', properties: { question: { type: 'string', description: "The student's question, max 300 characters, no names or IDs." } }, required: ['question'] } },
  { name: 'make_checklist', description: 'Show a short to-do list the student can tick, built from knowledge-base steps.',
    parameters: { type: 'object', properties: { title: { type: 'string' }, items: { type: 'array', items: { type: 'string' } } }, required: ['title', 'items'] } },
].map((f) => ({ type: 'function', function: f }));

// Runs one tool call. Returns the result for the page, or throws a message for the model.
export async function runTool(name, args, { question = '', lang = 'en', today = sgToday() } = {}) {
  // No personal IDs beyond what the student typed.
  const nric = JSON.stringify(args).match(NRIC);
  if (nric && !question.includes(nric[0])) throw new Error('Do not put NRIC/FIN or student IDs in tool arguments. Use "[student ID]".');
  if (name === 'draft_email') {
    const { to, team } = checkEmail(args.to);
    const subject = text(args.subject, 150, 'subject'), body = text(String(args.body ?? '').replace(/\\n/g, '\n'), 2000, 'body'); // models sometimes double-escape line breaks
    return { to, team: (lang === 'zh' && team.title_zh) || team.title, subject, body, mailto: mailto(to, subject, body) };
  }
  if (name === 'add_reminder') {
    const r = { title: text(args.title, 120, 'title'), date: checkDate(args.date, today), time: checkTime(args.time), notes: String(args.notes ?? '').trim().slice(0, 500) };
    return { ...r, filename: 'kampuscare-reminder.ics', ics: buildIcs(r) };
  }
  if (name === 'send_to_student_services') {
    const q = text(args.question, 300, 'question');
    const r = await enqueue(q);
    if (r.crisis) return { crisis: true };
    if (r.error) throw new Error(r.error);
    return { queued: true, question: r.question };
  }
  if (name === 'make_checklist') {
    const items = (Array.isArray(args.items) ? args.items : []).map((i) => String(i ?? '').trim()).filter(Boolean);
    if (!items.length || items.length > 10) throw new Error('"items" needs 1 to 10 entries.');
    return { title: text(args.title, 120, 'title'), items: items.map((i) => text(i, 200, 'item')) };
  }
  throw new Error(`Unknown tool "${name}".`);
}

const system = (kb, today, lang) => `You are KampusCare. A Kaplan Singapore student wants you to DO something for them, not just answer.
Today is ${today} (${new Date(today).toLocaleDateString('en-SG', { weekday: 'long', timeZone: 'UTC' })}), Singapore time.

RULES
- Decide which tools actually help, call them, then finish with a short message (at most 3 sentences) in ${LANGS[lang]} saying what you did and what the student must do next (e.g. tap to open the email and send it).
- Use ONLY facts, deadlines and contacts from the KNOWLEDGE BASE below. Never invent steps, policies, links, phone numbers or email addresses.
- draft_email: "to" must be an email address copied exactly from the knowledge base, for the student's programme team if they named it. Write the subject and body in English (Kaplan staff read English). Never invent names, student IDs, module codes or dates the student didn't give: write "[your name]", "[student ID]", "[module]" placeholders instead. Don't include medical details beyond what the student wrote.
- add_reminder: work out the date from today and the deadline in the knowledge base (e.g. "within 3 working days"). Title and notes in ${LANGS[lang]}; keep app and menu names like "Kaplan360" in English.
- make_checklist: only if the task has several steps; items come from the knowledge-base steps, in ${LANGS[lang]}.
- send_to_student_services: ONLY when the knowledge base cannot answer the question. Don't use it when an entry covers it.
- If no tool would help, don't call any; just reply.
- Write non-English text as normal characters, never as \\u escape codes.

KNOWLEDGE BASE
${JSON.stringify(kb.map(({ id, title, summary, steps, notes, contact }) => ({ id, title, summary, steps, notes, contact })))}`;

const ROUNDS = 4;

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });

  let body;
  try { body = await readBody(req); } catch { return send(res, 400, { error: 'Bad JSON' }); }

  const question = String(body.question || '').trim().slice(0, 1000);
  if (!question) return send(res, 400, { error: 'Empty message' });
  if (isCrisis(question)) return send(res, 200, { crisis: true });
  if (!API_KEY) return send(res, 500, { error: 'Server is missing LLM_API_KEY' });

  const lang = pickLang(body.lang), today = sgToday();
  const { kb, byId } = await knowledge();
  const entry = byId[String(body.id || '')];
  const messages = [
    { role: 'system', content: system(kb, today, lang) },
    { role: 'user', content: `${question}${entry ? `\n\n(I was reading the knowledge-base entry "${entry.id}".)` : ''}\n\nPlease do what you can for me. (Write reminder titles and notes, checklist items and your final message in ${LANGS[lang]}; the email stays in English.)` },
  ];

  const actions = [];
  // ROUNDS rounds with tools, then one forced text-only turn if the model is still calling tools.
  for (let round = 0; round <= ROUNDS; round++) {
    const { msg, error } = await callTools(messages, TOOLS, round < ROUNDS ? 'auto' : 'none');
    if (error) return actions.length ? send(res, 200, { message: '', actions }) : send(res, 502, { error });
    if (!msg.tool_calls?.length) return send(res, 200, { message: String(msg.content || '').trim(), actions });
    messages.push(msg);
    for (const call of msg.tool_calls) {
      const tool = call.function?.name;
      let args, content;
      try {
        args = JSON.parse(call.function?.arguments || '{}');
        const result = await runTool(tool, args, { question, lang, today });
        if (result.crisis) return send(res, 200, { crisis: true });
        actions.push({ tool, args, result });
        content = { ok: true, ...result, ics: undefined, mailto: undefined };
      } catch (err) {
        content = { ok: false, error: err.message };
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(content) });
    }
  }
  return send(res, 200, { message: '', actions });
}
