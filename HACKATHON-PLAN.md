# Hackathon build plan (2–3 Nov 2026)

Read README.md and PITCH-NOTES.md first. Steps 0–4 are built and deployed. Step 5 is what's left.

## Surprise features presented: F1 Your User Changed + F3 No More Typing (all 5 built)

| # | Feature (as announced) | What it means for KampusCare |
|---|---|---|
| 1 | **Your User Changed**: AI must understand a new user group's needs and generate output for them. | **Incoming international students** describe themselves in free text and get a personalised Before you fly / Week 1 / Week 2 plan, built only from knowledge-base entries. |
| 2 | **Human Must Decide**: AI drafts and flags risk; a person decides. | **AI drafts new answers; Student Services decides.** Staff tick every risk flag, then approve (with edits) or reject. Nothing reaches students until a human approves. |

Why these fit: feature 1 is the "week 0, before Kaplan360 login" pitch point. Feature 2 strengthens the main claim ("answers come from verified info") and covers the human-oversight part of the responsible-AI score.

---

## Step 0: Merge the team's fork ✅ `446f6f8`

Feedback reasons are saved (rating, one of 4 reasons, comment up to 200 characters, never the question). Links in steps are clickable and `\n` shows as a line break. The "KampusCare" header text is the home link. Real LMS links, campus codes, the self-study rule and the clubs link are kept.

## Step 1: English / 中文 dropdown ✅ `1018251`

Header switch, remembered in `localStorage`, defaults to 中文 for zh browsers. UI strings live in `STRINGS` in `index.html`. Every entry has `title_zh`. Chat and plan reply in the chosen language, with steps and notes translated and app names in English. The crisis card is translated with the numbers unchanged.

## Step 2: Contact details for every university ✅ `7900196`

A "Contacts" group with one entry per university/programme from the Oct 2026 Student Services PDF: team emails, no staff names. Escalation directors are in `feedback-grievance`. The knowledge base is now 32 entries.

## Step 3: Surprise feature 1, personalised arrival plan ✅ `61562d2`

`POST /api/plan`. Free-text profile → an editable "What we understood about you" block → Before you fly / Week 1 / Week 2. Each item has a source and checked date. The plan uses the student's programme contact line and LMS link. Dates are suggested. Print / save as PDF. Crisis filter runs on the text.

## Step 4: Surprise feature 2, staff review queue ✅ `dcb51c5`, `d51c7e5`, `f0b2767`

- Students **opt in** with "Send this question to Student Services" when there's no answer, or after "No → Incorrect/incomplete". Only the question text is stored, max 300 characters.
- On `review.html`, staff paste the Kaplan page text → **Draft with AI** → draft plus risk flags (`no_source`, `conflicts_with:<id>`, `policy_sensitive`, `low_confidence`), each with a reason and % confidence. Approve stays disabled until every flag is ticked.
- Approve (fields editable) or Reject with a note. Approved answers show in chat with "Approved by Student Services · date".
- Storage: Upstash Redis via Vercel Marketplace; in memory locally.
- The review page is **open with no password** for the demo. `STAFF_PASSWORD` in Vercel locks it.

## Step 5: Polish and pitch (remaining)

**Builder (tech):**
- [x] Crisis numbers checked 2 Nov 2026: 995, SOS 1767 / WhatsApp 9151 1767, mindline 1771 / WhatsApp 6669 1771 (IMH 6389 2222 is retired)
- [ ] Before the pitch: open /review.html and click "Reset demo" at the bottom (deletes all questions and approved answers)
- [ ] Make the repo public or invite the judges
- [ ] Rotate the Gemini key after the hackathon

**Team (pitch):**
- [ ] A Chinese speaker reviews `STRINGS.zh` in `index.html` and every `title_zh` in `knowledge.json` (later)
- [ ] Ask K360 head-to-head test, see [PITCH-NOTES.md](PITCH-NOTES.md)
- [ ] Deck: problem → solution → live demo → surprise features 1 and 2 → architecture → responsible AI → impact → next steps
- [ ] Record the backup demo video (README section 8)
- [ ] Rehearse twice

## Model / budget notes

- **The app runs on Gemini** Flash-Lite (free tier) with a fallback model, via env vars in Vercel.
- The team Anthropic key was used only for Claude Code while building, never in the live app.
