---
id: historical-engineering-4f2c3b4a6e65
type: review
status: processed
created: 2026-09-10
updated: 2026-09-10
topics: [agent-engineering, reusable-patterns]
tools: [Node.js, Codex]
sources: [reviewed-historical-engineering-evidence]
related: {}
memory_domain: agent-building-knowledge
privacy: public
---

# Historical engineering lessons

De-identified engineering notes retained from earlier agent work. These are
historical observations, not installed agents or current verification claims.

## UI And Lesson Experience

- V1 interface mode: Web Voice Only.
- The main lesson screen should prioritize watching the YouTube video comfortably.
- The lesson screen must include a simple place to paste a YouTube URL.
- After URL submit, the app should show extraction status and then a ready-to-practice state.
- The voice agent start/control UI should sit below the video as a lightweight lesson action area.
- The UI may show simple progress/success indicators, but the real feedback should come through the teacher's spoken response.
- Avoid dashboard-heavy grading during live practice. The user should feel like they are in a real conversation.
- Keep the learner in flow:
  - short prompts;
  - one task at a time;
  - immediate conversational correction;
  - retry when useful;
  - increase difficulty naturally when answers are good.
- The agent should avoid long analytical lectures unless the user asks for a detailed explanation.


## Lesson Derivative Policy

Default storage should be a compact lesson derivative, not a full copied lesson
book.

The derivative should preserve:

- lesson topic and communicative situation;
- target vocabulary;
- target phrases and grammar/speaking patterns;
- teacher's key rules or explanations;
- examples needed for exercises;
- comprehension questions;
- speaking drills;
- role-play prompts;
- assessment criteria for this specific video.

The derivative should remove:

- filler;
- long motivational sections;
- repeated examples that add no new pattern;
- ads/sponsor blocks;
- irrelevant channel talk;
- excessive transcript text.

Raw transcript storage is optional and should be treated as sensitive/source
material. For normal use, the agent should rely on the compact derivative plus
source URL/time references.


## Learning Memory Model

reference-agent memory must support personalized learning, not just storage.

Core entities:

- `lessons`: one source video or manually created lesson.
- `lesson_segments`: chunks/sections of the video lesson.
- `lesson_targets`: vocabulary, grammar, speaking pattern, pronunciation focus, communicative function.
- `exercises`: generated or extracted tasks tied to lesson targets.
- `practice_sessions`: one voice practice run.
- `attempts`: learner answer, expected target, correction, score and retry count.
- `learner_profile`: current level assumptions, preferred correction style, interests and goals.
- `skill_state`: mastered/weak/in-progress state per topic/pattern.
- `review_queue`: spaced repetition items due for reuse.

Memory behavior:

- New lessons should compare with previous targets.
- Later lessons may include natural review from older weak or important topics.
- The agent should avoid drilling old material mechanically; review should be embedded in realistic dialogue.
- Weak points should decay or strengthen based on repeated successful attempts.
- A lesson can be marked `mastered_for_now`, but not permanently mastered without later review.
- Review from previous lessons should appear as natural dialogue tasks, not as a mechanical flashcard drill unless the user asks for drills.

Lesson lifecycle statuses:

- `captured`: URL saved, metadata/transcript not processed yet.
- `extracting`: transcript/metadata/derivative extraction is running.
- `ready`: compact lesson derivative is ready for practice.
- `practicing`: voice session is active.
- `mastered_for_now`: learner passed the current lesson check.
- `needs_review`: learner should repeat or drill the material.
- `failed`: extraction failed and needs retry or manual fallback.


## Security And Permissions

- Secrets required: OpenAI API key; optional Codex CLI auth outside project.
- `.env.example` variables:
  - `OPENAI_API_KEY`;
  - `OPENAI_REALTIME_MODEL`;
  - `OPENAI_REALTIME_VOICE`;
  - `OPENAI_INPUT_TRANSCRIBE_MODEL`;
  - `APP_BASE_URL`;
  - `ALLOWED_ORIGINS`;
  - `FUNNY_TEACHER_DB_PATH`;
  - optional transcription settings.
- Allowed network access: OpenAI Realtime/API; YouTube/transcript retrieval; optional source metadata lookup.
- Allowed filesystem access: generated reference-agent project folder and its data directory.
- User authorization model: single trusted local learner in v1.
- Risk notes:
  - learner voice transcripts are sensitive;
  - YouTube transcript storage may have copyright implications, so store compact lesson derivatives when possible;
  - do not expose without auth;
  - do not claim exact pronunciation scoring unless the implementation measures it.

