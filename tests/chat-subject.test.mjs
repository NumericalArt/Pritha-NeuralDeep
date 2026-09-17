import assert from "node:assert/strict";
import test from "node:test";
import { composeChatSubject } from "../interfaces/control-center/src/lib/codex-chat/chat-subject.ts";

test("composeChatSubject: self kind composes a Pritha self subject", () => {
  const result = composeChatSubject("self");
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.subject, { taskType: "self", subjectId: null });
});

test("composeChatSubject: child kind with a valid slug composes agent_creation", () => {
  const result = composeChatSubject("child", "paper-radar");
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.subject, { taskType: "agent_creation", subjectId: "paper-radar" });
});

test("composeChatSubject: child kind rejects empty and malformed slugs", () => {
  for (const slug of ["", "bad slug", "task_type=agent_creation"]) {
    const result = composeChatSubject("child", slug);
    assert.equal(result.ok, false, `expected rejection for slug ${JSON.stringify(slug)}`);
    if (!result.ok) assert.match(result.error, /Child slug must be 1–80 chars/);
  }
});
