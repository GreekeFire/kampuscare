// Surprise feature 2, "Human must decide": students opt in to send an unanswered question; staff draft with AI,
// check every risk flag, then approve (optionally edited) or reject. Nothing reaches students until approved.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { KB, byId, API_KEY, isCrisis, readBody, send, callModel, getQueue, saveQueue } from '../lib/shared.js';

export const APPROVED_GROUP = 'Approved by Student Services';
const DEFAULT_CONTACT = byId['student-services-contacts'].contact;
const MAX_ITEMS = 500; // ponytail: hard cap so the public "ask" can't grow the single Redis key forever
const POLICY_RE = /\bfees?\b|refund|student'?s pass|\bICA\b|withdraw|defer|medical|\bMC\b|attendance/i;
const today = () => new Date().toISOString().slice(0, 10);

const str = (v, n) => String(v ?? '').trim().slice(0, n);

// Staff-edited or AI-drafted entry → safe entry. Title and at least one step are required.
export function cleanEntry(e = {}) {
  const steps = (Array.isArray(e.steps) ? e.steps : String(e.steps ?? '').split('\n'))
    .map((s) => str(s, 400)).filter(Boolean).slice(0, 12);
  const source = str(e.source, 300);
  const entry = {
    title: str(e.title, 120), summary: str(e.summary, 500), steps, notes: str(e.notes, 500),
    contact: str(e.contact, 200) || DEFAULT_CONTACT,
    source: /^https:\/\/\S+$/.test(source) ? source : '', // shown as a link to students: https only
  };
  const error = !entry.title ? 'A title is required.' : !steps.length ? 'At least one step is required.' : undefined;
  return { entry, error };
}

// Model flags → only known flags, known KB ids, clamped confidence; then the server's own checks.
export function cleanFlags(flags, pageText, question, entry) {
  const out = new Map();
  for (const f of Array.isArray(flags) ? flags : []) {
    const flag = str(f?.flag, 80);
    const known = ['no_source', 'policy_sensitive', 'low_confidence'].includes(flag) || (flag.startsWith('conflicts_with:') && byId[flag.slice(15)]);
    if (!known || out.has(flag)) continue;
    const c = Math.round(Number(f.confidence));
    out.set(flag, { flag, reason: str(f.reason, 200) || 'Flagged by the AI.', confidence: Number.isFinite(c) ? Math.min(100, Math.max(0, c)) : 50 });
  }
  if (!/https:\/\//.test(pageText) && !out.has('no_source'))
    out.set('no_source', { flag: 'no_source', reason: "The pasted text has no https link, so students can't check the source.", confidence: 100 });
  const hit = `${question}\n${pageText}\n${JSON.stringify(entry)}`.match(POLICY_RE);
  if (hit && !out.has('policy_sensitive'))
    out.set('policy_sensitive', { flag: 'policy_sensitive', reason: `Mentions "${hit[0]}": check it against current Kaplan policy.`, confidence: 100 });
  return [...out.values()];
}

const DRAFT_SYSTEM = `You help Kaplan Singapore Student Services turn a pasted Kaplan web page into a KampusCare knowledge-base entry that answers a student's question. A staff member checks your draft and flags before anything reaches students.

RULES
- Use ONLY the PASTED PAGE TEXT for facts. Never invent steps, links, phone numbers, emails, fees or policies. If the text doesn't answer the question, say so in "summary", leave "steps" empty and flag low_confidence.
- Write in English. "title" is short and task-shaped (e.g. "Print on campus"). "steps" are short instructions, in order.
- "source": the https URL of the page, copied exactly from the pasted text, or "".
- "contact": who to contact, copied from the pasted text or the knowledge base.
- Flags, only those that apply:
  - "conflicts_with:<id>": the draft contradicts an existing KNOWLEDGE BASE entry (use its exact id); say what differs.
  - "policy_sensitive": touches fees, refunds, Student's Pass, withdrawal, medical leave or attendance.
  - "low_confidence": the text only partly answers the question, is unclear, or may be out of date.
  - "no_source": the text has no URL or no date.
  Each flag has a one-line "reason" a staff member can check quickly, and "confidence" 0-100: how sure you are the flag is real.

Return JSON only:
{"entry": {"title": string, "summary": string, "steps": [string], "notes": string, "contact": string, "source": string},
 "flags": [{"flag": string, "reason": string, "confidence": number}]}

KNOWLEDGE BASE
${JSON.stringify(KB.map(({ id, title, summary, steps, notes, contact }) => ({ id, title, summary, steps, notes, contact })))}`;

// Student opt-in: queue a question for staff. Also used by api/act.js's send_to_student_services tool.
// Only the question text is stored: no IP, name or ID.
export async function enqueue(q) {
  const question = str(q, 300);
  if (!question) return { status: 400, error: 'Empty question' };
  if (isCrisis(question)) return { status: 200, crisis: true };
  const queue = await getQueue();
  if (queue.length >= MAX_ITEMS) return { status: 429, error: 'Student Services has a lot of questions right now. Please call +65 6733 1877.' };
  await saveQueue([...queue, { id: randomBytes(4).toString('hex'), question, status: 'pending', created: new Date().toISOString() }]);
  return { status: 200, question };
}

// Hash both sides so timingSafeEqual gets equal-length buffers.
const digest = (s) => createHash('sha256').update(String(s)).digest();
const staffOk = (pw) => timingSafeEqual(digest(pw ?? ''), digest(process.env.STAFF_PASSWORD));

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });

  let body;
  try { body = await readBody(req); } catch { return send(res, 400, { error: 'Bad JSON' }); }

  try {
    if (body.action === 'ask') {
      const r = await enqueue(body.question);
      return send(res, r.status, r.status === 200 ? (r.crisis ? { crisis: true } : { ok: true }) : { error: r.error });
    }

    // ponytail: no STAFF_PASSWORD = open review page (hackathon demo); set it in Vercel to lock the page
    if (process.env.STAFF_PASSWORD && !staffOk(body.password)) return send(res, 401, { error: 'Wrong staff password.' });

    const queue = await getQueue();
    if (body.action === 'list') return send(res, 200, { items: [...queue].sort((a, b) => b.created.localeCompare(a.created)) });
    // Demo reset: deletes every question and every approved answer, so the live demo starts from "not covered".
    if (body.action === 'clear') { await saveQueue([]); return send(res, 200, { items: [] }); }

    const item = queue.find((i) => i.id === body.id);
    if (!item) return send(res, 404, { error: 'No such question' });

    if (body.action === 'draft') {
      const pageText = str(body.pageText, 8000);
      if (!pageText) return send(res, 400, { error: 'Paste the Kaplan page text first.' });
      if (!API_KEY) return send(res, 500, { error: 'Server is missing LLM_API_KEY' });
      const { out, error } = await callModel([
        { role: 'system', content: DRAFT_SYSTEM },
        { role: 'user', content: `STUDENT QUESTION:\n${item.question}\n\nPASTED PAGE TEXT:\n${pageText}` },
      ]);
      if (error) return send(res, 502, { error });
      const draft = cleanEntry(out.entry).entry;
      if (draft.source && !pageText.includes(draft.source)) draft.source = ''; // the link must come from the pasted page
      draft.source ||= (pageText.match(/https:\/\/[^\s()<>"]*[^\s()<>".,;:!?]/) || [''])[0];
      Object.assign(item, { draft, flags: cleanFlags(out.flags, pageText, item.question, draft) });
      await saveQueue(queue);
      return send(res, 200, { item });
    }

    if (body.action === 'decide') {
      if (body.decision === 'approve') {
        const { entry, error } = cleanEntry(body.entry);
        if (error) return send(res, 400, { error });
        Object.assign(item, { status: 'approved', entry: { ...entry, group: APPROVED_GROUP }, note: str(body.note, 300) || undefined, decided: today() });
      } else if (body.decision === 'reject') {
        Object.assign(item, { status: 'rejected', entry: undefined, note: str(body.note, 300) || undefined, decided: today() });
      } else return send(res, 400, { error: 'decision must be approve or reject' });
      await saveQueue(queue);
      return send(res, 200, { item });
    }

    return send(res, 400, { error: 'Unknown action' });
  } catch (err) {
    console.error('review queue failed', err.message);
    return send(res, 502, { error: 'The review queue is unavailable right now. Please try again.' });
  }
}
