# Hackathon build plan (2–3 Nov 2026)

Read README.md and PITCH-NOTES.md first. This file is the to-do list for the 24 hours. Work top to bottom.

## Surprise features chosen (need at least 2)

| # | Feature (as announced) | What it means for KampusCare |
|---|---|---|
| 1 | **Your User Changed**: AI must understand a new user group's needs and generate output for them. | **New user group: incoming international students.** They describe themselves in free text (e.g. *"I'm from China, starting a Murdoch degree on 20 Nov, under 18, staying in a hostel"*) and the AI generates a **personalised first-2-weeks plan**, built only from knowledge-base entries. |
| 2 | **Human Must Decide**: AI drafts and flags risk; a person decides. | **AI drafts new answers; Student Services approves.** When the bot can't answer a question, AI drafts a new knowledge-base entry from pasted Kaplan text and flags risks. Staff **Approve / Modify / Reject** on a review page. Nothing reaches students until a human approves. |

Why these fit: feature 1 is the "week 0, before Kaplan360 login" pitch point. Feature 2 strengthens the main claim ("answers come from verified info") and covers the human-oversight part of the responsible-AI score.

## Build order (agreed)

1. **Step 0, fork fixes (~30 min).** Do these first: both surprise features change `index.html`, and fixing the fork afterwards means merge conflicts.
2. **Step 3, surprise feature 1** (arrival plan)
3. **Step 4, surprise feature 2** (review queue)
4. Step 2, uni contacts
5. Step 1, English / 中文 dropdown
6. Step 5, polish and pitch

## How the team's changes feed into the surprise features

| Team change / request | What to add | Ties into |
|---|---|---|
| Feedback with reasons ("Not what I asked for", "Incorrect/incomplete", …) | Save the reason on the server. A **"No → Incorrect/incomplete"** puts that answer into the staff review queue with the flag `student_reported`. | **Feature 2.** Students flag, AI drafts a fix, staff decide. Their feedback work becomes part of the human-oversight story. |
| Links added to steps (LMS portals, clubs page) | Make URLs in steps clickable, and show `\n` as line breaks. | Both features: plan items and staff-approved entries will contain links too. |
| Murdoch Moodle + Kaplan eLearn links | Plan items pick the right LMS link from the student's programme. | **Feature 1** |
| Campus codes WE / OD / NB | Add the codes to the `campuses` entry too, so "where is NB-5-12?" works. | Core Q&A |
| Home button | Make the "KampusCare" header text the home link, in the same style as the rest of the page. | Design consistency |
| Request: contacts per uni | One entry per university/programme team. | **Feature 1:** the plan ends with "Your Student Services contact: <the right team for your programme>". |
| Request: English / 中文 dropdown | UI strings plus `title_zh`; send `lang` to the API. | **Feature 1:** generate the plan in Chinese for students who pick 中文. |

---

## Step 0: Merge the team's fork (do first, ~20 min)

Fork: `ashleyquek03-blip/kampuscare`. It has 12 commits, and its `knowledge.json` is valid JSON (21 entries).

**Keep:** the real LMS URLs (Kaplan eLearn, Murdoch Moodle), the campus codes (WE / OD / NB), the self-study 3-hour rule in `attendance`, and the clubs link.

**Bugs to fix while merging:**
1. **Feedback reasons are thrown away.** The fork sends `feedback: "down_slow/buggy"` etc., but `api/chat.js` only keeps `up` or `down`. Fix: send `{ feedback: 'down', reason, comment }`. The server keeps `reason` only if it's one of the 4 allowed values, and truncates `comment` to 200 characters. Don't log the student's original question.
2. **Links aren't clickable and line breaks don't show.** Steps like `"Go to your LMS portal:\nMurdoch students: (https://…)"` render as one flat line of text. Fix: in `answer()`, split steps on `\n`, and turn `https://…` into `<a>` elements built with `createElement`. Never use `innerHTML` with model output.
3. **Home button breaks the design** (blue `#0066cc`, Arial, a shadow). Remove it and make the "KampusCare" header text a link to `/` instead, using the existing styles.
4. **Junk keyword** `"Access the LMS steps unverified"` in the `lms` entry. Delete it.

Then run `npm test`.

## Step 1: Language dropdown, English / 中文 (~1.5 h)

- Add a `<select>` in the header with English and 中文. Remember the choice in `localStorage`, wrapped in try/catch.
- Put the UI strings in one `STRINGS = { en: {...}, zh: {...} }` object in `index.html`: headline, stance, group names, provenance line, placeholder, footer, feedback text, crisis card, errors.
- Topic titles: add an optional `title_zh` to each entry in `knowledge.json`. Have Claude draft them, then have a Chinese speaker on the team check them.
- Send `lang` to `/api/chat`. The system prompt says "reply in {lang} unless the student clearly wrote in another language".
- Keep app and menu names in English in both languages.

## Step 2: Contact details for every university (~45 min)

- Source: the Student Services contact list PDF (Oct 2026), already parsed. The full list is in the `student-services-contacts` entry plus the PDF itself.
- Split it into **one entry per university**: Kaplan Diploma / Foundation, Murdoch, UCD (full-time, part-time, masters), Northumbria (3 teams), BCU, Portsmouth, Monash, Aston, Kaplan Financial. Each entry gets the phone number, team email (not personal names), opening hours and source PDF link, under a new group "Contacts".
- Also add the escalation contacts (Student Services directors) to `feedback-grievance`.
- The start screen then shows a "Contacts" group automatically, since it's built from `knowledge.json`.

## Step 3: Surprise feature 1, personalised arrival plan (~3 h)

**UI:** a "New international student? Get your plan" link on the start screen opens a short form: one free-text box, plus optional chips for programme and arrival date. The result is a dated checklist with three sections: *Before you fly* / *Week 1* / *Week 2*.

**API:** `POST /api/plan { text, lang }` → model call with the knowledge base → JSON:
```json
{ "profile": {"programme": "...", "under18": true, "arrival": "2026-11-20"},
  "sections": [{ "title": "Before you fly", "items": [{ "id": "new-international", "task": "...", "due": "2026-11-13" }] }],
  "missing": ["things we couldn't answer from the knowledge base"] }
```
- Every item must cite a knowledge-base `id`. The server drops unknown ids, same as `toCards`.
- Show the **profile the AI understood**, so the student can correct it. That's the visible "AI understood the user" moment.
- Under-18 → include the parent-consent notes. Student's Pass → ICA address update, 90% attendance, insurance.
- Run the crisis filter on the free text too.
- **Demo line:** "Same knowledge base, new user group, different output."

## Step 4: Surprise feature 2, human review queue (~4 h)

**Storage:** Vercel serverless functions have no disk, so add **Upstash Redis** (free) via Vercel → Storage → Marketplace. It gives `KV_REST_API_URL` and `KV_REST_API_TOKEN`; call its REST API with `fetch`, no package needed.

**Flow:**
1. A student question that gets no match is saved to the queue as `unanswered` (question text only, max 300 characters, no IP or ID).
2. `review.html` is the staff page, protected by a `STAFF_PASSWORD` environment variable (a simple shared password is fine for the demo; say so).
3. Staff open an unanswered question, paste the relevant Kaplan page text, and click **Draft with AI** → `POST /api/review/draft` returns a draft entry plus **risk flags**:
   - `no_source` (pasted text has no URL or date)
   - `conflicts_with:<id>` (contradicts an existing entry)
   - `policy_sensitive` (fees, Student's Pass, withdrawal, medical)
   - `low_confidence`
   - Each flag comes with a one-line reason, like the slide's "peanut allergy conflict (92% sure)".
4. Staff choose **Approve / Modify / Reject**. Approved entries go into Redis with the staff note and date. `api/chat.js` merges approved entries into the knowledge base on each request.
5. The approved entry shows on student cards as "Approved by Student Services · date".

**Demo:** ask an unknown question (e.g. "how do I print on campus?") → "not covered" → switch to the review page → Draft → a `no_source` flag appears → Modify → Approve → ask again → answered, with the approval badge.

## Step 5: Polish and pitch (~2 h)

- Re-run `npm test`. Add one assertion each for the plan and the review id filtering.
- Update README sections 3, 9 and the AI disclosure, plus PITCH-NOTES (new judge answers: "who approves content?", "what does the AI do for international students?").
- Record the backup demo video.
- Deck: problem → solution → live demo → surprise features 1 and 2 → architecture → responsible AI → impact → next steps.

## Order if time runs short

Follow the build order at the top. Steps 0, 3 and 4 are required. Steps 2 and 1 come after, if time allows.

## Model / budget notes

- **The app keeps using Gemini** (the key in Vercel). The team Anthropic key is only for Claude Code while coding.
- In Claude Code, stay on Haiku 4.5 as the organisers asked, and `/clear` between steps.
