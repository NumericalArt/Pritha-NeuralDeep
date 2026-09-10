---
id: 2026-08-26-control-center-codex-chat-wireframe
type: workflow
status: proposed
created: 2026-08-26
updated: 2026-08-27
topics:
  - pritha-control-center
  - codex-chat
  - wireframe
  - responsive-design
  - voice-dictation
  - thread-history
tools:
  - Next.js
  - React
  - TypeScript
  - Codex App Server
  - Server-Sent Events
sources:
  - docs/ui-design/2026-06-04-pritha-control-center-spec-v0.4.txt
  - docs/ui-design/2026-06-04-mobile-ui-implementation-guide.txt
  - interfaces/control-center/src/components/shell/Sidebar.tsx
  - interfaces/control-center/src/components/shell/MobileShell.tsx
  - interfaces/control-center/src/lib/routes.ts
  - interfaces/control-center/src/styles/tokens.css
  - 05_decisions/2026-08-26-control-center-codex-chat-architecture.md
  - 04_standards/control-center-codex-chat-api-contract.md
related:
  decisions:
    - 05_decisions/2026-08-26-control-center-codex-chat-architecture.md
  standards:
    - 04_standards/control-center-codex-chat-api-contract.md
    - 04_standards/realtime-voice-control-ui.md
  interfaces:
    - interfaces/control-center/
supersedes:
  - docs/ui-design/2026-06-04-pritha-control-center-spec-v0.4.txt#section-7-rule-7-no-full-chat
superseded_by: []
freshness_status: current
source_published: unknown
source_updated: 2026-08-26
source_version: Control Center Codex Chat wireframe v1
retrieved: 2026-08-26
verified: 2026-08-26
valid_for: Pritha Control Center /codex responsive implementation
temporal_status: version-bound
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - pritha-self
  - governance
subject:
  kind: workflow
  id: control-center-codex-chat-wireframe
privacy: public
retention: design-draft
review_status: proposed
confidence: high
---

# Wireframe: Pritha Control Center Codex Chat

Date: 2026-08-26
Status: proposed for visual acceptance
Route: `/codex`

## 1. Product intent

`/codex` is a direct conversation surface with Codex. It is not the Realtime
voice agent and it is not a second task dashboard.

- Typed or dictated text goes directly to the selected Codex conversation.
- The response appears as a normal Markdown answer with bounded activity cards.
- The operator can create, find, switch, fork and archive chats.
- Voice work is visible through explicit task/thread links without mixing every
  Voice task into ordinary chat history.
- Runtime limitations are visible but do not dominate the conversation.

## 2. Navigation amendment

Desktop order:

```text
Agents
Voice
Codex      <- new
Settings
Dev (Read-only)
```

Mobile bottom navigation:

```text
Voice | Agents | Codex | Settings
```

The existing root redirect remains unchanged: desktop `/` still opens Agents
and mobile `/` still opens Voice. Codex is an explicit destination.

## 3. Desktop information architecture

The existing desktop sidebar remains the app-wide navigation. Inside `/codex`,
the page adds one local history rail and one conversation pane.

```text
┌──────────────┬────────────────────────┬─────────────────────────────────────────────┐
│ PRITHA       │ CODEX CHATS            │ Control Center Codex Chat        Ready      │
│ Control      │ [+ New chat]           │ Pritha · GPT model · Desktop · App Server   │
│ Center       │ [ Search chats... ]    ├─────────────────────────────────────────────┤
│              │                        │                                             │
│ Agents       │ MY CHATS               │ You                                         │
│ Voice        │ ● Control Center...    │ Build the API contract and wireframe.        │
│ Codex        │   Memory review        │                                             │
│ Settings     │                        │ Codex                                       │
│ Dev          │ VOICE WORK             │ I fixed the architecture around one gateway. │
│              │   Control Center · A7K │                                             │
│              │                        │ ▸ Activity · 3 actions                      │
│              │ OTHER SESSIONS         │ ┌ Voice task A7K · linked · completed ┐      │
│              │ ▸ 4 project sessions   │ └─────────────────────────────────────┘      │
│              │                        │                                             │
│ Access       │                        ├─────────────────────────────────────────────┤
│ Local        │                        │ [ Ask Codex...                         ][mic]│
│              │                        │                                    [Send]   │
└──────────────┴────────────────────────┴─────────────────────────────────────────────┘
```

### Desktop widths

- Existing global sidebar: unchanged.
- Local history rail: 280–304 px at wide desktop, 232–256 px at compact desktop.
- Conversation column: consumes remaining width; readable message measure is
  capped around 820 px and centered inside it.
- No permanent third inspector. Activity, diffs and requests are inline cards;
  details may open in a temporary drawer only when needed.

## 4. Local history rail

Top controls:

- `New chat` is the single primary action.
- Search matches the visible extracted title.
- Archive access sits in the history overflow menu, not as a fourth permanent
  group.

Groups:

1. `My chats`
   - created in `/codex`;
   - normal continuation behavior;
   - pin, rename, fork and archive available when capabilities allow.
2. `Voice work`
   - linked native threads grouped by subject scope;
   - row shows task short id and status when useful;
   - task-only work is labelled `No chat history` and opens its task card.
3. `Other project sessions`
   - collapsed by default;
   - only exact Pritha project sessions;
   - read-only until the operator chooses `Adopt` or `Fork`.

Each row has title, one-line preview or scope, relative update time and at most
one state mark: active, waiting, degraded or task-only. Do not show provider,
model and task badges on every row.

## 5. Conversation header

First line:

- editable thread title;
- thread state: `Ready`, `Working`, `Needs approval`, `Needs answer`, `Failed`;
- overflow menu: rename, pin, fork, archive.

Second line is compact runtime context:

```text
Pritha · <model> · <Desktop bundled | Standalone CLI> · <App Server | Exec resume> · <sandbox>
```

Rules:

- Show `Bound to Desktop bundled` when current global settings prefer another
  provider but this chat remains safely bound to its original state.
- A healthy App Server is quiet neutral metadata, not a green hero banner.
- Degraded exec/queue mode gets one persistent warning banner below the header.
- Never show raw binary paths or Codex state paths.

## 6. Transcript and activity

The main reading order is chronological and turn-based:

1. user message;
2. Codex answer and user-facing progress;
3. inline activity items in the order emitted;
4. approval or question card at the exact pause point;
5. linked Voice task card when a relationship exists.

Render:

- Markdown paragraphs, headings, lists, tables and fenced code;
- file paths as project-relative links when resolvable;
- command/file/tool activity collapsed to one summary row by default;
- live assistant text with a subtle streaming caret/status;
- file diff in an expandable code surface;
- plans with stable pending/in-progress/completed states;
- tool errors as bounded inline notices;
- the final response as the visual focus.

Do not render:

- raw chain-of-thought or raw reasoning deltas;
- full unbounded stdout/stderr;
- secret values, auth payloads or private state paths;
- raw App Server method names as primary UI copy.

## 7. Approval and question cards

Approval cards remain inside the transcript so their context is preserved.

Command approval:

```text
┌ Needs approval ───────────────────────────────────────────┐
│ Run project tests?                                       │
│ npm test                                                 │
│ The command runs in Pritha with workspace-write access.  │
│ [Decline]                    [Allow once] [Allow session] │
└───────────────────────────────────────────────────────────┘
```

File approval uses changed paths/diff summary. Permission approval shows the
requested network/filesystem subset. User input shows 1–3 questions with the
runtime-provided choices and a freeform option only when allowed.

Only decisions actually advertised by the pending request are rendered. After
resolution, controls become a compact immutable result such as `Allowed once`.

## 8. Composer and dictation

Desktop composer:

```text
┌───────────────────────────────────────────────────────────┐
│ Ask Codex…                                                │
│                                                           │
│ <model/effort inherited>              [microphone] [Send] │
└───────────────────────────────────────────────────────────┘
```

Rules:

- `Enter` sends; `Shift+Enter` inserts a newline.
- Send is disabled for empty text and while submission acknowledgement is
  pending.
- During an active turn, the explicit secondary action is `Steer`; a new turn is
  not silently queued.
- Microphone starts browser dictation/transcription into the same editable text
  area. It never auto-sends.
- Dictation states are `idle`, `requesting microphone`, `listening`,
  `transcribing`, `error`.
- While listening, the microphone button is visibly active and has a text label
  on mobile; stopping leaves recognized text editable.
- Realtime Voice Control remains on `/voice`; `/codex` does not open a second
  live voice persona or play synthesized responses.

Attachments are deferred from the v1 contract. Do not show a decorative upload
button until the API accepts safe staged inputs.

## 9. Voice task relationship

Linked task card:

```text
Voice task A7K · Pritha Control Center
Completed · shared thread · 3 linked turns
[Open task] [Continue in this chat]
```

Relationship behavior:

- A Voice task using a native Codex thread appears in `Voice work`.
- `Continue in this chat` is explicit and validates the runtime/state binding.
- `Result reference` shows a cross-link but does not reroute future turns.
- An ephemeral/queue task shows `Task record only · no native chat history` and
  never pretends to be a chat.
- Direct chat never automatically becomes the subject-scoped Voice thread.

## 10. Mobile wireframe

At widths below 768 px the existing desktop sidebar and local history rail are
replaced by the existing mobile shell plus a chat picker drawer.

```text
┌─────────────────────────────────────┐
│ Pritha · Control Center       Ready │
│ [☰] Control Center Codex Chat   [⋯] │
│ Desktop bundled · App Server       │
├─────────────────────────────────────┤
│                                     │
│ You                                 │
│ Build the contract and wireframe.   │
│                                     │
│ Codex                               │
│ One gateway keeps App and CLI       │
│ behavior consistent.                │
│                                     │
│ ▸ Activity · 3 actions              │
│ Voice task A7K · linked             │
│                                     │
├─────────────────────────────────────┤
│ [ Ask Codex…                    ]    │
│ [Start dictation]            [Send] │
├─────────────────────────────────────┤
│ Voice    Agents    Codex    Settings│
└─────────────────────────────────────┘
```

Chat picker drawer:

```text
┌─────────────────────────────────────┐
│ Chats                       [Close] │
│ [+ New chat]                        │
│ [Search chats…]                     │
│                                     │
│ MY CHATS                            │
│ ● Control Center Codex Chat         │
│   Memory indexing review            │
│ VOICE WORK                          │
│   Pritha Control Center · A7K       │
│ OTHER PROJECT SESSIONS              │
│   Show 4 sessions                   │
└─────────────────────────────────────┘
```

Mobile rules:

- transcript and composer use the full width;
- composer stays after transcript content in the product surface and remains
  reachable above bottom navigation and safe-area inset;
- the selected chat title opens the drawer;
- approval buttons stack or wrap with the safest action last/right;
- no horizontal scroll at 320 px;
- command and diff content may scroll inside their own code block, never the
  whole page;
- the four-item bottom navigation uses short labels and 44 px minimum targets.

## 11. Required visual states

| State | Header | Transcript | Composer |
| --- | --- | --- | --- |
| Empty first run | `New chat` | short explanation + suggested first prompt | active |
| Loading history | title skeleton/text | bounded loading indicator | disabled until binding known |
| Ready | `Ready` | complete history | active |
| Streaming | `Working` | live answer + activity | `Steer` and `Stop` available |
| Needs approval | `Needs approval` | approval card at pause point | may steer; no second turn |
| Needs answer | `Needs answer` | question card | answer through card |
| Interrupted | `Interrupted` | completed partial output + notice | active |
| Recoverable failure | `Failed` | error + `Resume`/`Checkpoint`/`New chat` | guarded |
| Degraded exec | `Degraded` | one persistent limitation banner | active for supported text turns |
| Queue/task-only | `Task record only` | task card, not fake transcript | direct chat disabled until persistent chat is created |
| Runtime mismatch | `Rebind required` | compatibility explanation | `Fork` or validated rebind only |
| Archived | `Archived` | read-only history | replaced with `Unarchive` |

Transient history/runtime errors use one inline banner with `Retry` and
`Dismiss`. `Retry` performs a read-only runtime, thread-list and selected-chat
history synchronization; it never resubmits the user's message.

## 12. Interaction sequences

### New direct chat

```text
New chat
  -> create Pritha chat binding
  -> show empty transcript immediately
  -> user types or dictates and edits
  -> start turn once
  -> connect/reconnect SSE
  -> stream answer and activity
  -> replace deltas with completion snapshot
```

### Missed completion or reconnect

```text
SSE disconnects or completion event is missed
  -> keep the submitted turn visible
  -> reconcile selected native history (2 s active / 5 s reconnecting)
  -> replace local Working state with the authoritative terminal snapshot
  -> refresh the history row and re-enable the composer
  -> Retry remains available if reconciliation itself fails
```

### Continue Voice work in current chat

```text
Open Voice task card
  -> choose Continue in this chat
  -> validate state/runtime compatibility
  -> create shared_thread link
  -> show immutable linked-task card
  -> next accepted request starts one linked turn
```

### Mid-turn transport loss

```text
turn.started already observed
  -> mark recoverable failure
  -> do not invoke fallback automatically
  -> inspect current state
  -> operator chooses Resume, Checkpoint, or New chat
```

## 13. Accessibility

- The page has one `h1` for the selected chat; history group headings use
  lower-level headings.
- History is a labelled navigation region; transcript is a labelled feed or
  log with chronological DOM order.
- New streamed text uses one polite live region and does not announce every
  token or command-output delta.
- Approval/input cards move focus only when the user initiated the action that
  produced them; otherwise announce their availability politely.
- Icon-only controls have accessible names; state is never color-only.
- Keyboard order is history controls, selected thread, header actions,
  transcript actions and composer.
- Touch targets are at least 44 × 44 px on mobile.
- Reduced-motion mode removes streaming caret animation and non-essential
  transitions.

## 14. Implementation component map

```text
app/codex/page.tsx
  CodexChatPage
    CodexHistoryRail
      CodexThreadGroup
      CodexThreadRow
    CodexConversation
      CodexThreadHeader
      CodexRuntimeBanner
      CodexTurnList
        CodexMessage
        CodexActivityItem
        CodexPendingRequestCard
        CodexTaskLinkCard
      CodexComposer
        CodexDictationButton
    CodexHistoryDrawer (mobile)
```

State/data split:

- server routes/gateway own runtime, thread binding, idempotency and approvals;
- React query/cache owns fetched pages and mutation acknowledgement;
- an SSE reducer owns normalized live events;
- composer/dictation draft is local browser state and is not persisted as a
  message until Send/Steer succeeds.

## 15. Visual acceptance checklist

- Desktop clearly distinguishes global navigation, local chat history and the
  active conversation without adding a permanent inspector.
- Mobile provides chat switching without shrinking the transcript.
- `My chats`, `Voice work` and `Other project sessions` are understandable
  without exposing native ids.
- Runtime source/protocol is visible once, near the thread title.
- Approval, question, degraded and linked-task states are understandable in
  place.
- Dictation visibly produces editable draft text and never auto-sends.
- Final Markdown answer stays visually dominant over tools and runtime status.
- All required states fit at 320 px without whole-page horizontal scrolling.
- The design preserves existing Voice Control behavior and the accepted Control
  Center visual language.

## 16. Open visual choices for acceptance

The architecture and API do not depend on these presentational choices:

1. History rail width: 280 px versus 304 px on wide screens.
2. Active chat mark: purple left bar versus subtle filled row.
3. Activity detail: inline expansion versus a temporary right drawer for large
   diffs only.

Wireframe v1 recommends 288 px history, a subtle filled active row plus small
left accent, and inline expansion with a temporary drawer only for unusually
large diffs.
