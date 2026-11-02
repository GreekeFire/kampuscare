# KampusCare

An accessibility web app for wellbeing support and service navigation at Kaplan Singapore.

### 👉 [kampuscare.vercel.app](https://kampuscare.vercel.app)

**Challenge statement:** Wellbeing support tool and service navigation.

## Why we built it

- **Orientation.** Leaving our first orientation, we were confused about everything. It was all so overwhelming. So we made **Getting started**: the information you need to start school, simplified and in one place.
- **The student handbook.** Every student gets a handbook, but it's hard to tell which parts matter for your situation. So we made **Contacts**, organised by your own university or programme.
- **Wellbeing.** Sometimes school is just stressful. So we made **Wellbeing**: a walkthrough for booking a counsellor, and a breathing exercise for everyday stress.
- **International students.** Being new to Singapore and on your own is daunting, and homesickness is common. So in **Talk to a senior** you can reach a senior student in your field, ideally from your country, or get a student buddy to show you the ropes and around Singapore when you first arrive.

## What it does

### Getting started
Simplified topics for your first weeks: finding your classes and timetable, getting into the Kaplan360 app and the LMS, campus locations and opening hours, updating your details, and arriving as an international student.

### Contacts
The right Student Services team for your programme: Kaplan Diploma, Foundation Diploma, Murdoch, Monash, UCD, Northumbria, BCU, Portsmouth, Aston and more, plus a "Which team do I contact?" guide.

### Ask in your own words
Type a question in any language, or switch the interface to 中文. Each answer is a short reply plus up to three cards with steps, a contact, a source link and a "last checked" date. If KampusCare doesn't know, it says so and tells you who to ask.

### Wellbeing
Opened from "Feeling stressed?" on the start screen. Runs in the browser, with no AI and nothing stored.
- **Calming breath:** breathe in 4, hold 2, out 6, for five rounds, with animated waves and a short check-in after.
- **Book a counsellor:** illustrated steps for booking Kaplan's free, confidential counselling in Kaplan360.
- **Talk to a senior:** choose stress about your course (matched by field) or "I'm new to Singapore" (a buddy matched by home country). The profiles are labelled samples, not real students, and a note makes clear that seniors are not counsellors.

### Urgent help
An **Urgent help** button is always visible. It shows Emergency **995**, SOS **1767** (WhatsApp **9151 1767**) and mindline **1771** (WhatsApp **6669 1771**). The same card appears automatically if a message matches the crisis check.

## Hackathon surprise features

- **Your User Changed:** a personalised plan for new international students, showing the essentials. Describe yourself in your own words; KampusCare shows what it understood (editable), then dated, sourced steps for before you fly, week 1 and week 2, plus your programme's Student Services contact and a link to find a buddy.
- **No More Typing:** another way to get your question across, by voice message, in languages such as English and Chinese. Hold the mic, and the answer starts with "You said: …" followed by sourced cards. You can also attach a photo, such as a screenshot or a letter, as a secondary option.

## How it stays trustworthy

- **No made-up answers.** The AI may only cite `knowledge.json`. The server builds every card, so contacts, links and dates never come from the AI.
- **Crisis first.** A keyword check in more than ten languages runs before any AI call and returns the fixed crisis card. The AI's own crisis flag is a backup.
- **Works when the AI is busy.** The server tries several models in turn, then falls back to keyword-matched pages labelled "AI is busy".
- **Private by default.** No login, no database, no chat history. Photos and voice clips are sent to Gemini to answer and not kept.
- **Safe rendering.** Student and model text is added with `textContent`, never `innerHTML`.
- **Honest about age.** Every card shows its "last checked" date, and unconfirmed steps carry a badge.

---

## For developers

### How it works

```
Browser (index.html)
  ├─ question, voice or photo ──► /api/chat
  │                                 1. crisis keyword check ──► match: crisis card, no AI
  │                                 2. Gemini, with the whole knowledge base in the prompt
  │                                 3. server builds cards from knowledge.json
  │                                 all models busy ──► keyword match, "AI is busy" cards
  ├─ "about me" text ───────────► /api/plan  (same crisis check and model list)
  └─ Wellbeing page ──────────── browser only, no AI
```

- **Front end:** one file, `index.html`, no framework or build step. Holds the English and 中文 strings.
- **Back end:** Vercel serverless functions in `api/`, shared code in `lib/shared.js`.
- **AI:** Google Gemini through its OpenAI-compatible endpoint; any OpenAI-compatible provider works via the `LLM_` variables.
- **Knowledge base:** `knowledge.json`, 32 entries from Kaplan's public pages (20 topics in four groups plus 12 Student Services contacts). It fits in one prompt, so there is no vector search.

### Project structure

| File | Purpose |
|---|---|
| `index.html` | The whole app: chat, arrival plan, voice and photo, Wellbeing, Urgent help, English and 中文. |
| `api/chat.js` | Chat: input checks, crisis check, AI call, card building, AI-busy fallback, feedback logging. |
| `api/plan.js` | Arrival plan: profile, dated plan, programme contact. |
| `lib/shared.js` | Knowledge base loading, crisis regex, model call with fallback list. |
| `knowledge.json` | The knowledge base. |
| `dev.js` | Local dev server (not used on Vercel). |
| `test.js` | Self-check: crisis filter, input checks, knowledge base, plan filtering, fallback, wellbeing matching. |
| `.env.example` | Environment variable template. |

### Run it locally

Needs Node.js 20+. No dependencies.

1. Get a free Gemini API key at https://aistudio.google.com/apikey.
2. Copy `.env.example` to `.env` and set `LLM_API_KEY`.
3. Run `node --env-file=.env dev.js` and open http://localhost:3000.
4. Run the self-check with `npm test`.

| Variable | Default | Purpose |
|---|---|---|
| `LLM_API_KEY` | (none) | Required. |
| `LLM_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai` | OpenAI-compatible endpoint. |
| `LLM_MODEL` | `gemini-3.5-flash-lite` | Main model. |
| `LLM_FALLBACK_MODEL` | `gemini-3.1-flash-lite` | Comma-separated models tried in order when the main one is busy. |

**Deploy:** import the repo into Vercel and add the variables above. No config file needed. Never commit `.env`.

### Updating the knowledge base

Each entry in `knowledge.json` has `id`, `group`, `title`, `title_zh`, `keywords`, `summary`, `steps`, `notes`, `contact`, `source` (Kaplan page URL), `reviewed` (`YYYY-MM-DD`) and optional `sample` (`true` shows the "not yet confirmed" badge). Copy an existing entry, give it a new `id`, fill every field, set `reviewed` to today and run `npm test`; it fails on missing fields or repeated ids.

### Limitations

- **Two topics are unverified:** viewing your timetable and applying for leave in Kaplan360 aren't on public pages, so they're marked unconfirmed.
- **Free-tier Gemini** has rate limits and may use inputs to improve Google's products. The app asks students not to enter names, IDs or medical details.
- **Peer profiles are samples.** A real version needs trained, opt-in Kaplan peer mentors.
- **The knowledge base needs an owner** at Kaplan to keep dates current.
- **Chinese text** was drafted with AI and needs a native-speaker review.
- **The crisis check is a keyword list** and can miss indirect phrasing.

### AI use disclosure

- The app uses Google Gemini at runtime for answers, arrival plans, and reading photos and voice clips.
- The code was written with help from Claude Code (Anthropic).
- The Chinese interface text was drafted with AI.
- Facts in `knowledge.json` were checked against Kaplan Singapore's public pages, linked on each entry.

---

Built by team Kampus Care Bears for the Kaplan Singapore AI for Impact hackathon, November 2026.
