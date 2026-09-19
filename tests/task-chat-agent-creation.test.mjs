import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, existsSync, realpathSync, symlinkSync } from "node:fs";
import path from "node:path";
import { NeuralDeepCoordinationStore } from "../scripts/neuraldeep/coordination-store.mjs";
import { NeuralDeepExecutionWorkspaces } from "../scripts/neuraldeep/execution-workspaces.mjs";
import {
  parseTaskChatAgentCreation,
  reserveTaskChatAgentTarget,
  taskChatAgentCreationNotice,
} from "../scripts/neuraldeep/task-chat-agent-creation.mjs";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";

test("Task Chat reserves a sibling only for explicit task_type=agent_creation plus a slug", () => {
  assert.equal(parseTaskChatAgentCreation("создай агента cheap-hit-radar"), null);
  assert.deepEqual(
    parseTaskChatAgentCreation("Scaffold only. task_type=agent_creation\n$PRITHA_AGENT_PARENT/cheap-hit-radar"),
    { taskType: "agent_creation", subjectId: "cheap-hit-radar" },
  );
  assert.deepEqual(
    parseTaskChatAgentCreation("task_type=agent_creation subject_id=youth-hobby-radar"),
    { taskType: "agent_creation", subjectId: "youth-hobby-radar" },
  );
  assert.deepEqual(
    parseTaskChatAgentCreation("task_type=agent_creation"),
    { taskType: "agent_creation", subjectId: null },
  );
  assert.deepEqual(
    parseTaskChatAgentCreation("task_type=agent_creation. subject_id=cheap-hit-radar. Не Resume."),
    { taskType: "agent_creation", subjectId: "cheap-hit-radar" },
  );
});

test("Task Chat allocation writes one reserved folder and never the parent", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "nd-task-chat-agent-"));
  const parent = path.join(root, "children");
  const memory = path.join(root, "agents");
  const stateRoot = path.join(root, "state");
  mkdirSync(parent);
  mkdirSync(stateRoot);
  const store = new NeuralDeepCoordinationStore({ databasePath: path.join(stateRoot, "admission.sqlite") });
  const allocator = new NeuralDeepExecutionWorkspaces(store, { stateRoot });
  try {
    const skipped = reserveTaskChatAgentTarget({
      allocator, ownerId: "chat_plain", agentParent: parent, agentMemoryRoot: memory,
      sandbox: "workspace-write", text: "Interview only. Не пиши contract.",
    });
    assert.equal(skipped.requested, false);
    assert.deepEqual(skipped.additionalWritableDirs, []);
    assert.equal(existsSync(path.join(parent, "cheap-hit-radar")), false);

    const reserved = reserveTaskChatAgentTarget({
      allocator, ownerId: "chat_create", agentParent: parent, agentMemoryRoot: memory,
      sandbox: "workspace-write",
      text: "task_type=agent_creation\nПиши в $PRITHA_AGENT_PARENT/cheap-hit-radar",
    });
    const target = path.join(realpathSync(parent), "cheap-hit-radar");
    assert.equal(reserved.requested, true);
    assert.equal(reserved.agentTarget, target);
    assert.equal(existsSync(target), true);
    assert.deepEqual(reserved.additionalWritableDirs, [target]);
    assert.equal(reserved.additionalWritableDirs.includes(parent), false);
    assert.equal(reserved.additionalWritableDirs.includes(realpathSync(parent)), false);

    const again = reserveTaskChatAgentTarget({
      allocator, ownerId: "chat_create", agentParent: parent, agentMemoryRoot: memory,
      sandbox: "workspace-write",
      text: "task_type=agent_creation subject_id=cheap-hit-radar",
    });
    assert.equal(again.agentTarget, target);

    const continued = reserveTaskChatAgentTarget({
      allocator, ownerId: "chat_fill", agentParent: parent, agentMemoryRoot: memory,
      sandbox: "workspace-write",
      text: "task_type=agent_creation\nsubject_id=cheap-hit-radar",
    });
    assert.equal(continued.agentTarget, target);
    assert.equal(continued.additionalWritableDirs.includes(target), true);

    mkdirSync(path.join(parent, "youth-hobby-radar"));
    assert.throws(
      () => reserveTaskChatAgentTarget({
        allocator, ownerId: "chat_hijack", agentParent: parent, agentMemoryRoot: memory,
        sandbox: "workspace-write",
        text: "task_type=agent_creation\nsubject_id=youth-hobby-radar",
      }),
      { code: "agent_target_exists" },
    );

    const notice = taskChatAgentCreationNotice({
      requested: true, agentTarget: target, agentMemoryRoot: memory,
    });
    assert.match(notice, /execution_agent_target/);
    assert.doesNotMatch(notice, /parent directory is writable/);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("Task Chat structured task wins over text and reserves without a header in text", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "nd-task-chat-struct-"));
  const parent = path.join(root, "children");
  const memory = path.join(root, "agents");
  const stateRoot = path.join(root, "state");
  mkdirSync(parent);
  mkdirSync(stateRoot);
  const store = new NeuralDeepCoordinationStore({ databasePath: path.join(stateRoot, "admission.sqlite") });
  const allocator = new NeuralDeepExecutionWorkspaces(store, { stateRoot });
  try {
    const reserved = reserveTaskChatAgentTarget({
      allocator, ownerId: "chat_structured", agentParent: parent, agentMemoryRoot: memory,
      sandbox: "workspace-write", text: "Сделай contract для Paper Radar",
      task: { taskType: "agent_creation", subjectId: "paper-radar" },
    });
    const target = path.join(realpathSync(parent), "paper-radar");
    assert.equal(reserved.requested, true);
    assert.equal(reserved.agentTarget, target);
    assert.equal(existsSync(target), true);

    const skipped = reserveTaskChatAgentTarget({
      allocator, ownerId: "chat_struct_other", agentParent: parent, agentMemoryRoot: memory,
      sandbox: "workspace-write", text: "task_type=agent_creation subject_id=x",
      task: { taskType: "self_improvement" },
    });
    assert.equal(skipped.requested, false);
    assert.deepEqual(skipped.additionalWritableDirs, []);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("creation executor writes drafts only and cannot approve canonical documents", () => {
  const root=mkdtempSync(path.join(os.tmpdir(),'nd-task-chat-state-'));
  const stateRoot=path.join(root,'state'),parent=path.join(root,'children'),memory=path.join(stateRoot,'agents');
  mkdirSync(parent);mkdirSync(stateRoot);
  const store=new NeuralDeepCoordinationStore({databasePath:path.join(stateRoot,'admission.sqlite')});
  const allocator=new NeuralDeepExecutionWorkspaces(store,{stateRoot});
  try {
    const authoringRoot=path.join(stateRoot,'creation-drafts','creation_'+'a'.repeat(24));
    const options={allocator,ownerId:'chat_state',agentParent:parent,agentMemoryRoot:memory,stateRoot,
      sandbox:'workspace-write',task:{taskType:'agent_creation',subjectId:'state-radar'},authoringRoot,writableTarget:false};
    const reserved=reserveTaskChatAgentTarget(options);
    assert.deepEqual(reserved.additionalWritableDirs,[realpathSync(authoringRoot)]);
    for(const protectedPath of [parent,stateRoot,memory,path.join(stateRoot,'audit'),reserved.agentTarget]) {
      assert.equal(reserved.additionalWritableDirs.includes(protectedPath),false);
    }
    assert.throws(()=>reserveTaskChatAgentTarget({...options,authoringRoot:path.join(stateRoot,'audit')}),{code:'creation_document_boundary'});
    const redirected=path.join(stateRoot,'creation-drafts','creation_'+'b'.repeat(24));
    symlinkSync(parent,redirected);
    assert.throws(()=>reserveTaskChatAgentTarget({...options,authoringRoot:redirected}),{code:'creation_document_boundary'});
  } finally {store.close();rmSync(root,{recursive:true,force:true});}
});

test("Task Chat notice never instructs executor to approve documents", () => {
  const withRoots = taskChatAgentCreationNotice({
    requested: true, agentTarget: "/a/target",
    writableDirs: ["/a/target", "/s/audit"],
  });
  assert.ok(withRoots.includes("Writable roots for this turn: /a/target, /s/audit"));
  assert.match(withRoots,/Never approve your own documents/);
  assert.doesNotMatch(withRoots,/run outcome approve|audit are writable/);

  const noSibling = taskChatAgentCreationNotice({
    requested: true, agentTarget: null,
    writableDirs: ["/s/audit"],
  });
  assert.ok(noSibling.includes("Writable roots for this turn: /s/audit"));
  assert.doesNotMatch(noSibling,/run outcome approve/);

  const plain = taskChatAgentCreationNotice({ requested: true, agentTarget: "/a/target" });
  assert.doesNotMatch(plain, /Writable roots for this turn/);
  assert.doesNotMatch(plain, /outcome approve/);
});
