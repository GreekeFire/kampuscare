// Surprise feature 1: a personalised first-2-weeks plan for incoming students, built only from knowledge.json.
import { KB, byId, API_KEY, isCrisis, readBody, send, callModel } from '../lib/shared.js';

const PROFILE_KEYS = ['programme', 'home', 'arrival', 'under18', 'accommodation', 'studentPass'];
// Same shape as the link regex in index.html, so server and page agree on where a URL ends.
const URL_RE = /https:\/\/[^\s()<>"]*[^\s()<>".,;:!?]/g;
const KB_URLS = new Set(JSON.stringify(KB).match(URL_RE));
const CONTACTS = byId['student-services-contacts'];

const system = (today) => `You are KampusCare. You write a personalised arrival plan for a student about to start at Kaplan Singapore.
Today is ${today}.

RULES
- Use ONLY the KNOWLEDGE BASE below. Every item must cite the "id" of the entry it comes from. Never invent steps, menus, links, phone numbers, emails, fees or policies.
- Three sections, in this order: "Before you fly", "Week 1", "Week 2". For students already living in Singapore, call the first one "Before you start" and leave out travel and arrival items ("new-international").
- Each item: "id" (a knowledge-base id), "task" (one or two short sentences saying exactly what to do), "due" (a date YYYY-MM-DD worked out from the arrival or start date, or "" if there is no sensible date).
- Student's Pass holders (international students, unless they say otherwise): include the ICA address update within 14 days of moving in ("update-details"), the 90% attendance rule ("attendance") and the group medical insurance ("insurance-clinic").
- Singaporeans and permanent residents do NOT hold a Student's Pass: no ICA, Student's Pass, airport pickup or 90% items. Their attendance minimum is 75%.
- Under 18: add the parent or guardian notes from the knowledge base (written consent for withdrawal or deferment in "withdraw-defer", parent or guardian details in "update-details").
- LMS ("lms"): the task MUST contain the full https link for the student's programme, copied exactly from the knowledge base, and only that one: Murdoch degree students get the Murdoch Moodle link, Kaplan diploma students get Kaplan eLearn.
- Remind them that Kaplan360 login only arrives after the programme starts ("kaplan360-login").
- "missing": short list of things this student needs that the knowledge base can't answer (e.g. visa application steps, hostel booking, SIM card). Never answer them yourself.
- LANGUAGE: first decide which language the student's message is written in. Write every "task", every section "title" and every "missing" item in that language: the language they WROTE in, not their home country's language. An English message gets an English plan; a message in another language gets a plan fully in that language, with the three section titles translated too and the English knowledge-base steps translated, never copied. Keep app and menu names (e.g. "Kaplan360", "Academic", "Counselling", "+ New") in English, inside quotes. Write non-English text as normal characters, never as \\u escape codes.
- "profile" values stay in short English. "programme" names the university or Kaplan programme as written in the "student-services-contacts" entry (e.g. "Murdoch University degree", "Kaplan Diploma"). "home" is the home country and language. Use null for anything the student didn't say; under18 and studentPass are true, false or null.
- If the student's message corrects their profile, those corrected values win.

Return JSON only:
{"profile": {"programme": string|null, "home": string|null, "arrival": "YYYY-MM-DD"|null, "under18": boolean|null, "accommodation": string|null, "studentPass": boolean|null},
 "sections": [{"title": string, "items": [{"id": string, "task": string, "due": string}]}],
 "missing": [string]}

KNOWLEDGE BASE
${JSON.stringify(KB.map(({ id, title, summary, steps, notes }) => ({ id, title, summary, steps, notes })))}`;

const str = (v, n) => (v == null || v === '' ? null : String(v).slice(0, n));
const bool = (v) => (typeof v === 'boolean' ? v : null);

export function cleanProfile(p = {}) {
  return {
    programme: str(p.programme, 80), home: str(p.home, 80), arrival: str(p.arrival, 20),
    under18: bool(p.under18), accommodation: str(p.accommodation, 80), studentPass: bool(p.studentPass),
  };
}

// The "Contacts" entry for the student's programme, matched on distinctive title/keyword words ("Murdoch", "UCD", "ACCA").
const GENERIC = /^(university|college|kaplan|degrees?|business|full|time|part|student|services|contact|email|phone|programmes?|masters?|msc|the|and|of|in|for)$/;
const words = (s) => s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2 && !GENERIC.test(w));
const TEAMS = KB.filter((e) => e.group === 'Contacts' && e.id !== CONTACTS.id)
  .map((e) => ({ e, words: new Set(words([e.title, ...(e.keywords || [])].join(' '))) }));
// Within the matched university, the step line for the student's own programme (e.g. Northumbria nursing vs business).
// Plain words here: "part"/"full" are generic across universities but tell UCD's lines apart.
const plain = (s) => s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2);
function bestLine({ e }, programme) {
  const p = plain(programme);
  let best = null, score = 0;
  for (const step of e.steps) {
    const n = plain(step.split(':')[0]).filter((w) => p.includes(w)).length;
    if (n > score) { best = step; score = n; }
  }
  return e.steps.length > 1 && best ? `${e.title.replace(/ Student Services$/, '')}, ${best}` : e.contact;
}
export function programmeContact(programme) {
  const p = words(String(programme || ''));
  let best = null, score = 0;
  for (const t of TEAMS) {
    const n = p.filter((w) => t.words.has(w)).length;
    if (n > score) { best = t; score = n; }
  }
  return best ? bestLine(best, String(programme)) : CONTACTS.contact;
}

// Unknown ids are dropped; contact, source and checked date come from knowledge.json; links the KB doesn't contain are removed.
export function toPlan(out = {}) {
  const profile = cleanProfile(out.profile);
  const sections = (Array.isArray(out.sections) ? out.sections : []).slice(0, 3).map((s) => ({
    title: str(s?.title, 60) || '',
    items: (Array.isArray(s?.items) ? s.items : [])
      .filter((i) => i && byId[i.id])
      .slice(0, 10)
      .map((i) => {
        const e = byId[i.id];
        return {
          id: e.id, title: e.title,
          task: String(i.task || e.summary).slice(0, 500).replace(URL_RE, (u) => (KB_URLS.has(u) ? u : '')),
          due: str(i.due, 40) || '',
          contact: e.contact, source: e.source, reviewed: e.reviewed, sample: e.sample,
        };
      }),
  })).filter((s) => s.items.length);
  return {
    profile, sections,
    missing: (Array.isArray(out.missing) ? out.missing : []).slice(0, 8).map((m) => String(m).slice(0, 200)),
    contact: { line: programmeContact(profile.programme), source: CONTACTS.source, reviewed: CONTACTS.reviewed },
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });

  let body;
  try { body = await readBody(req); } catch { return send(res, 400, { error: 'Bad JSON' }); }

  const text = String(body.text || '').trim().slice(0, 1000);
  if (!text) return send(res, 400, { error: 'Tell us a little about yourself first.' });
  const fix = body.profile ? cleanProfile(body.profile) : null;

  if (isCrisis(text + ' ' + JSON.stringify(fix || ''))) return send(res, 200, { crisis: true });
  if (!API_KEY) return send(res, 500, { error: 'Server is missing LLM_API_KEY' });

  // Flash-Lite tends to answer in the home country's language; plain ASCII text is English, so say so.
  // ponytail: ASCII check only; a Malay or Bahasa message typed without accents still gets the model's own judgement.
  const lang = /^[\x00-\x7F‘’“”–—…]*$/.test(text) ? 'English' : 'the same language as the student message above';
  const user = `${text}${fix ? `\n\nCorrected profile (these values are right): ${JSON.stringify(fix)}` : ''}\n\n(Write the plan in ${lang}.)`;
  const { out, error } = await callModel([
    { role: 'system', content: system(new Date().toISOString().slice(0, 10)) },
    { role: 'user', content: user },
  ]);
  if (error) return send(res, 502, { error });
  // The student's correction is what we understood, whatever the model echoes back.
  return send(res, 200, toPlan(fix ? { ...out, profile: fix } : out));
}
