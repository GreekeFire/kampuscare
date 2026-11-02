# KampusCare

A Kaplan Singapore "how do I…" guide that only answers from Kaplan's own public information.

**Live app:** https://kampuscare.vercel.app

New Kaplan students often don't know how to do basic things: book a counsellor, apply for leave, find their LMS, or work out who to contact. International students have it hardest, because many arrive before they get their Kaplan360 login. KampusCare answers those questions from Kaplan's public pages only. Every answer shows a contact, a source link and the date it was checked, and when KampusCare doesn't know, it says so and tells the student who to ask.

Built for the Kaplan Singapore "AI for Impact" hackathon, November 2026.

## What it does

### Ask in your own words

Students type a question in any language. The interface can switch between English and 中文. Each answer is a short reply plus up to three cards. A card has step-by-step instructions, a contact, a source link and a "last checked" date. App and menu names stay in English so they match what the student sees on screen. If nothing fits, the reply points to Student Services.

### Arrival plan for new international students

Opened from "New international student? Get your first 2 weeks planned" on the start screen. The student describes themselves in free text: programme, home country, arrival date, age, accommodation. KampusCare then shows:

- **What we understood about you**: the profile it worked out, editable, so a wrong field can be fixed and the plan regenerated.
- **Dated steps** in three sections: Before you fly (or Before you start, for students already in Singapore), Week 1 and Week 2. Each item cites a knowledge-base entry with its source and checked date.
- **Your Student Services team**: the contact line for the student's own programme, for example Murdoch, UCD or Northumbria.
- **Things not covered yet**, such as visa applications or SIM cards, which it lists rather than answers.
- A link to find a student buddy, and a print / save-as-PDF button.

### Ask by voice or photo

Students can hold the mic button and speak, or tab to it and hold the space bar. A red dot and a seconds counter show it is listening. They can also attach a photo or screenshot, such as a Kaplan360 error, a letter or a notice. The answer starts with "You said: …" or "In your photo: …" so the student can check what was understood, followed by the usual sourced cards.

### Wellbeing

Opened from "Feeling stressed?" on the start screen or from the counselling card. It runs entirely in the browser, uses no AI and stores nothing.

- **Calming breath**: one rhythm (in 4, hold 2, out 6, five rounds) with animated waves, then a short "how do you feel?" check-in.
- **Counselling booking**: illustrated steps for booking Kaplan's free counselling service.
- **Talk to a senior / student buddy**: matches by field of study and home country. The profiles are labelled samples, not real students, with a clear note that seniors are not counsellors.

### Urgent help

An "Urgent help" button is always visible. It opens a fixed card with:

- Emergency: **995**
- SOS: **1767**, or WhatsApp **9151 1767**
- mindline: **1771**, or WhatsApp **6669 1771**

The same card appears automatically when a message or plan request matches the crisis check.

## Hackathon surprise features

| Feature | How KampusCare meets it |
|---|---|
| **Your User Changed** | A new user group, incoming international students, gets its own output: the editable profile and the dated arrival plan, with their programme's contact and buddy link. |
| **No More Typing** | Voice clips and photos are sent to Gemini, which reads or hears them. The answer shows what it understood before the sourced steps. |

## How it stays trustworthy

| Concern | What KampusCare does |
|---|---|
| Made-up answers | The AI may only answer from `knowledge.json`. The server builds every card. Contacts, source links and checked dates come from the knowledge base, never from the AI. Unknown entry ids are dropped, and links in plan items that aren't in the knowledge base are removed. |
| Someone in crisis | A keyword check in more than ten languages runs before any AI call, on chat messages and plan requests. A match returns the fixed crisis card. The AI's own crisis flag, and a second keyword check on what it read in a photo or heard in a voice clip, act as a backup. |
| AI busy or out of quota | The server tries a list of models in turn. If all fail, chat shows the closest knowledge-base pages, matched by keyword with no AI, and labels the answer "AI is busy". |
| Privacy | No login, no database, no chat history. Photos and voice clips are checked for type and size, sent to Gemini to answer, and not kept by KampusCare. Feedback logs only a rating, a fixed reason, a short comment and entry ids, never the question. |
| Unsafe HTML | Text from students and from the model is added with DOM nodes and `textContent`. `innerHTML` is used only for the app's own fixed SVG artwork. |
| Outdated steps | Every card shows its "last checked" date. Steps that couldn't be confirmed carry an "App steps not yet confirmed" badge. |

## How it works

```
Browser (index.html)
  ├─ question, voice or photo ──► /api/chat
  │                                 1. crisis keyword check ──► match: crisis card, no AI
  │                                 2. Gemini, with the whole knowledge base in the prompt
  │                                    (model list: LLM_MODEL, then each LLM_FALLBACK_MODEL)
  │                                 3. server builds cards from knowledge.json
  │                                 all models busy ──► keyword match, "AI is busy" cards
  ├─ "about me" text ───────────► /api/plan
  │                                 same crisis check and model list
  │                                 server keeps only cited entries, adds contacts and dates
  └─ Wellbeing page ──────────── runs in the browser only, no AI
```

- **Front end:** a single file, `index.html`, with no framework or build step. It holds the English and 中文 strings.
- **Back end:** Vercel serverless functions in `api/`, with shared code in `lib/shared.js`.
- **AI:** Google Gemini through its OpenAI-compatible endpoint. Any OpenAI-compatible provider works by changing the `LLM_` variables.
- **Knowledge base:** `knowledge.json`, 32 entries from Kaplan's public pages, each with a source URL and a checked date. There are 20 topics in four groups (Getting started, Classes and exams, Health and wellbeing, Money and admin) and 12 Student Services contact entries. The whole knowledge base fits in one prompt, so there is no vector search.

## Project structure

| File | Purpose |
|---|---|
| `index.html` | The whole student-facing app: chat, arrival plan, voice and photo input, Wellbeing page, Urgent help, English and 中文 text. |
| `api/chat.js` | Chat endpoint: input checks, crisis check, AI call, card building, AI-busy fallback, feedback logging. |
| `api/plan.js` | Arrival plan endpoint: profile, dated plan and programme contact. |
| `lib/shared.js` | Knowledge base loading, crisis regex, model call with fallback list. |
| `knowledge.json` | The knowledge base. |
| `dev.js` | Local server for development. Not used on Vercel. |
| `test.js` | Self-check: crisis filter, input checks, knowledge base completeness, plan filtering, AI-busy fallback, wellbeing matching. |
| `.env.example` | Environment variable template. |
| `.vercelignore` | Keeps Markdown files, `test.js`, `dev.js` and `.prompts` off the live site. |

## Run it locally

Needs Node.js 20 or later. There are no dependencies, so `npm install` is not required.

1. Get a free Gemini API key at https://aistudio.google.com/apikey.
2. Copy `.env.example` to `.env` and set `LLM_API_KEY`.
3. Start the server and open http://localhost:3000:
   ```bash
   node --env-file=.env dev.js
   ```
4. Run the self-check:
   ```bash
   npm test
   ```

Environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `LLM_API_KEY` | (none) | API key for the model provider. Required. |
| `LLM_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai` | OpenAI-compatible endpoint. |
| `LLM_MODEL` | `gemini-3.5-flash-lite` | Main model. |
| `LLM_FALLBACK_MODEL` | `gemini-3.1-flash-lite` | Comma-separated list of models tried in order when the main one is overloaded or rate-limited. |

`.env.example` also shows a Groq configuration as a backup provider.

**Deploy to Vercel:** import the repository into Vercel and add the environment variables above. Vercel serves `index.html` and runs `api/*.js` as functions, so no configuration file is needed. Never commit `.env`.

## Updating the knowledge base

Each entry in `knowledge.json` has these fields:

| Field | Meaning |
|---|---|
| `id` | Unique id, used by the AI to cite the entry. |
| `group` | Section, e.g. "Getting started" or "Contacts". |
| `title`, `title_zh` | English and Chinese titles. |
| `keywords` | Words used by the AI-busy keyword fallback. |
| `summary` | One or two sentences. |
| `steps` | Ordered list of steps. |
| `notes` | Extra conditions or warnings. |
| `contact` | Who to contact. |
| `source` | URL of the Kaplan page the entry comes from. |
| `reviewed` | Date the entry was last checked, `YYYY-MM-DD`. |
| `sample` | `true` if the steps are not yet confirmed. Shows a badge. |

To add or edit an entry, copy an existing one, give it a new `id`, fill in every field, set `reviewed` to today, and run `npm test`. The test fails if a required field is missing or an id is repeated.

## Limitations and next steps

- **Two topics are unverified.** The Kaplan360 steps for viewing your timetable and applying for leave are not on Kaplan's public pages, so they are marked unconfirmed. They need checking against real Kaplan360 screens.
- **Free-tier Gemini.** It has rate limits, and Google may use free-tier inputs to improve its products. The app asks students not to enter names, student IDs or medical details. A paid plan or a Kaplan-tenant model would be needed for real student data.
- **Peer profiles are samples.** The senior and buddy profiles on the Wellbeing page are not real students. A real version needs trained, opt-in Kaplan peer mentors.
- **The knowledge base needs an owner.** Kaplan staff should own and review the entries so dates stay current.
- **Chinese text** was drafted with AI and should be reviewed by a native speaker.
- **The crisis check is a keyword list.** It can miss indirect phrasing. The AI's crisis flag is a second check, not a guarantee.

## AI use disclosure

- The app uses Google Gemini at runtime (`gemini-3.5-flash-lite` by default) for answers, arrival plans, and reading photos and voice clips.
- The code was written with help from Claude Code (Anthropic).
- The Chinese interface text was drafted with AI.
- Facts in `knowledge.json` were checked against Kaplan Singapore's public pages, linked on each entry.

---

Built by team Kampus Care Bears for the Kaplan Singapore AI for Impact hackathon, November 2026.
