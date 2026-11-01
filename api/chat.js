import { readFileSync } from 'node:fs';

const KB = JSON.parse(readFileSync(new URL('../knowledge.json', import.meta.url), 'utf8'));
const byId = Object.fromEntries(KB.map((e) => [e.id, e]));

// Any OpenAI-compatible provider works: swap these three env vars (see README).
const BASE_URL = process.env.LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai';
// Tried in order: if one is overloaded (503) or rate-limited (429), the next one answers.
const MODELS = [process.env.LLM_MODEL || 'gemini-3.5-flash-lite', process.env.LLM_FALLBACK_MODEL || 'gemini-3.1-flash-lite'];
const API_KEY = process.env.LLM_API_KEY;

// Checked BEFORE the AI sees anything, so a crisis never depends on the model.
// ponytail: keyword list, will miss indirect phrasing; the model's "crisis" flag is the second net.
const CRISIS = /suicid|kill my ?self|\bend (my life|it all)\b|want to die|wanna die|don'?t want to (live|be alive)|no reason to live|self[- ]?harm|hurt (my ?self)|cut(ting)? myself|自杀|自殺|想死|不想活|轻生|结束生命|bunuh diri|tự tử|자살|ฆ่าตัวตาย|आत्महत्या|தற்கொலை|magpakamatay/i;

export const isCrisis = (text) => CRISIS.test(text);

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

async function readBody(req) {
  if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return JSON.parse(raw || '{}');
}

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });

  let body;
  try { body = await readBody(req); } catch { return send(res, 400, { error: 'Bad JSON' }); }

  // Thumbs up/down: log the entry ids and rating only. Never the student's message.
  if (body.feedback) {
    console.log('feedback', JSON.stringify({ rating: body.feedback === 'up' ? 'up' : 'down', ids: [].concat(body.ids || []).slice(0, 3) }));
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
  let status = 0;
  // Each model gets one try; a busy model or unreadable JSON moves on to the next.
  for (const model of MODELS) {
    try {
      const r = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ model, response_format: { type: 'json_object' }, messages }),
      });
      status = r.status;
      if (!r.ok) { console.error('LLM error', model, r.status, (await r.text()).slice(0, 300)); continue; }
      const text = (await r.json()).choices?.[0]?.message?.content || '{}';
      const out = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
      if (out.crisis) return send(res, 200, { crisis: true });
      return send(res, 200, { reply: String(out.reply || ''), cards: toCards(out.matches) });
    } catch (err) {
      console.error('LLM failed', model, err.message);
    }
  }
  return send(res, 502, { error: status === 429 || status === 503 ? 'The AI is busy right now. Please try again in a minute.' : 'Something went wrong with the AI. Please try again.' });
}
