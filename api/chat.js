import { KB, byId, API_KEY, isCrisis, readBody, send, callModel } from '../lib/shared.js';

const SYSTEM = `You are KampusCare, a guide that helps Kaplan Singapore students find how to do things and who to contact.

RULES
- Answer ONLY from the KNOWLEDGE BASE below. Never invent steps, menus, links, phone numbers, emails or policies.
- If nothing in the knowledge base fits, return an empty "matches" list and suggest contacting Student Services (+65 6733 1877).
- Pick at most 3 entries, most relevant first.
- Reply in the same language the student wrote in. Keep app and menu names (e.g. "Kaplan360", "Academic", "Counselling", "+ New") in English, inside quotes.
- Be warm and brief: "reply" is at most 2 sentences.
- You are not a counsellor and do not give medical, legal or financial advice. For stress or feeling low, point to the "counselling" entry.
- Set "crisis" to true ONLY if the student expresses wanting to die, suicide, self-harm, or being in immediate physical danger. Stress, anxiety, sadness, loneliness, exam pressure or "I'm so done with this module" are NOT a crisis: answer those normally and point to the "counselling" entry gently, without mentioning hotlines.

Return JSON only, in this shape:
{"reply": string, "crisis": boolean, "matches": [{"id": string, "why": string, "steps": [string]}]}
- "reply", "why" and every item in "steps" must be written in the SAME language as the student's message. If the student wrote in Chinese, translate each knowledge-base step into Chinese; do not copy the English steps.
- "why" is one sentence on why this entry fits the student's situation.
- Write non-English text as normal characters, never as \\u escape codes.

KNOWLEDGE BASE
${JSON.stringify(KB.map(({ id, title, summary, steps, notes }) => ({ id, title, summary, steps, notes })))}`;

// Contacts, sources and review dates always come from the knowledge base, never from the model.
function toCards(matches = []) {
  return matches
    .filter((m) => byId[m.id])
    .slice(0, 3)
    .map((m) => {
      const e = byId[m.id];
      return {
        id: e.id, title: e.title, why: m.why || '',
        steps: Array.isArray(m.steps) && m.steps.length ? m.steps : e.steps,
        notes: e.notes, contact: e.contact, source: e.source, reviewed: e.reviewed, sample: e.sample,
      };
    });
}

// Feedback: rating, one of 4 fixed reasons, short free text. Never the student's question.
const REASONS = ['not_asked', 'incorrect', 'slow', 'other'];
export function cleanFeedback(body) {
  const down = body.feedback !== 'up';
  return {
    rating: down ? 'down' : 'up',
    reason: down && REASONS.includes(body.reason) ? body.reason : undefined,
    comment: down && body.comment ? String(body.comment).slice(0, 200) : undefined,
    ids: [].concat(body.ids || []).slice(0, 3),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });

  let body;
  try { body = await readBody(req); } catch { return send(res, 400, { error: 'Bad JSON' }); }

  if (body.feedback) {
    console.log('feedback', JSON.stringify(cleanFeedback(body)));
    return send(res, 200, { ok: true });
  }

  const message = String(body.message || '').trim().slice(0, 1000);
  if (!message) return send(res, 400, { error: 'Empty message' });

  if (isCrisis(message)) return send(res, 200, { crisis: true });
  if (!API_KEY) return send(res, 500, { error: 'Server is missing LLM_API_KEY' });

  const history = (Array.isArray(body.history) ? body.history : [])
    .slice(-6)
    .filter((h) => h && (h.role === 'user' || h.role === 'assistant'))
    .map((h) => ({ role: h.role, content: String(h.content).slice(0, 1000) }));

  const messages = [{ role: 'system', content: SYSTEM }, ...history, { role: 'user', content: message }];
  const { out, error } = await callModel(messages);
  if (error) return send(res, 502, { error });
  if (out.crisis) return send(res, 200, { crisis: true });
  return send(res, 200, { reply: String(out.reply || ''), cards: toCards(out.matches) });
}
