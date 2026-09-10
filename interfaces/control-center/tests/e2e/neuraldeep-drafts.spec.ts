import { expect, test, type Page, type Route } from "@playwright/test";

const now = new Date().toISOString();
const scope = "c".repeat(24);
function envelope(data: unknown) { return { apiVersion: "1", requestId: "synthetic-browser", data }; }
function detail(chatId: string, title: string) {
  return { thread: { chatId,title,preview:"",group:"my_chats",origin:"chat",status:"idle",activeFlags:[],pinned:false,archived:false,historyKind:"private",createdAt:now,updatedAt:now,
    runtime:{providerId:"neuraldeep_cli",sessionId:null,model:"fixture-image",effort:null,stateIdentityHash:scope,capabilities:{interruptTurn:true},protocol:"exec_resume"},taskLinks:[],continuationState:"continuation_enabled" },activeTurnId:null,pendingRequests:[],streamUrl:`/api/codex-chat/v1/threads/${chatId}/events`,continuationState:"continuation_enabled" };
}
function turn(message: { clientMessageId: string; input: { text: string }[]; attachments?: string[] }, files: Map<string, unknown>) {
  return { turnId:`turn_${message.clientMessageId.replaceAll("-","")}`,clientMessageId:message.clientMessageId,status:"completed",userMessage:{id:"item_user",role:"user",markdown:message.input[0].text,status:"completed",createdAt:now,attachments:(message.attachments || []).map(id=>files.get(id))},items:[],pendingRequestIds:[],startedAt:now,completedAt:now,error:null };
}
async function fixture(page: Page) {
  const health = await (await page.request.get("/api/health")).json();
  expect(health.instance?.role).toBe("development");expect(health.instance?.id).toMatch(/fixture|e2e|test/);
  const creates: Array<{ route: Route; body: any }> = [], messages: Array<{ route: Route; body: any }> = [];
  const threads = new Map<string, ReturnType<typeof detail>>(), histories = new Map<string, any[]>(), files = new Map<string, any>();
  await page.addInitScript(() => { (window as any).__ndEventSources=[];class QuietEventSource extends EventTarget { static OPEN=1; readyState=1; onopen: (()=>void)|null=null; constructor(public url:string) { super();(window as any).__ndEventSources.push(this);setTimeout(()=>{this.onopen?.();this.dispatchEvent(new Event("open"));},0); } close(){this.readyState=2;} }; Object.defineProperty(window,"EventSource",{value:QuietEventSource}); });
  await page.route("**/api/codex-chat/v1/**",async route=>{
    const request=route.request(), url=new URL(request.url());
    const send=(value:unknown,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(envelope(value))});
    if(url.pathname.endsWith("/runtime")) return send({preferredProvider:"neuraldeep_cli",effectiveProvider:"neuraldeep_cli",effectiveProtocol:"exec_resume",availability:"ready",fallbackEnabled:false,providers:[{providerId:"neuraldeep_cli",availability:"ready",version:"fixture",label:"NeuralDeep",stateIdentityHash:scope,capabilities:{fullChat:true},protocol:"exec_resume",locationLabel:"NeuralDeep Codex CLI"}],models:[{id:"fixture-image",label:"Fixture image",effortIds:[],serviceTierIds:[],defaultEffortId:null}],selected:{modelId:"fixture-image",effortId:null,serviceTierId:null,sandboxMode:"workspace_write",approvalMode:"never"},probedAt:now,provider:"neuraldeep",providerState:"available"});
    if(url.pathname.endsWith("/attachments/capabilities")) return send({image:"supported",files:"supported",imageFormats:["image/png"]});
    if(url.pathname.includes("/attachments/")) {
      const response=await route.fetch();
      if(request.method()==="PUT" && response.ok()) { const body=await response.json();files.set(body.data.id,body.data); }
      return route.fulfill({response});
    }
    if(url.pathname.endsWith("/attachments")) return route.continue();
    if(url.pathname.endsWith("/ui-activity")) return send({recorded:true});
    if(url.pathname.endsWith("/threads") && request.method()==="POST") {creates.push({route,body:request.postDataJSON()});return;}
    if(url.pathname.endsWith("/threads")) return send({data:Array.from(threads.values()).map(row=>row.thread).filter(row=>row.archived===(url.searchParams.get("archived")==="true")),nextCursor:null});
    const match=/\/threads\/(chat_[A-Za-z0-9_-]+)(?:\/(.*))?$/.exec(url.pathname);
    if(match){
      if(match[2]==="turns" && request.method()==="POST"){messages.push({route,body:request.postDataJSON()});return;}
      if(match[2]==="history")return send({data:histories.get(match[1])||[],olderCursor:null,newerCursor:null,hasOlder:false,hasNewer:false,completeness:"captured-from-creation"});
      if(!match[2])return send(threads.get(match[1]));
      if(match[2]==="events")return route.fulfill({contentType:"text/event-stream",body:": fixture\n\n"});
    }
    return route.fulfill({status:404,contentType:"application/json",body:"{}"});
  });
  await page.goto("/task-chat");
  await expect(page.getByRole("textbox",{name:"Message Pritha",exact:true})).toBeEnabled();
  await expect(page.getByLabel("Attach original files")).toBeEnabled();
  return {creates,messages,threads,histories,files,async accept(index:number,chatId:string){const current=creates[index];const next=detail(chatId,current.body.initialTurn.input[0].text||"Attachments"); const accepted=turn(current.body.initialTurn,files);threads.set(chatId,next);histories.set(chatId,[accepted]);await current.route.fulfill({status:202,contentType:"application/json",body:JSON.stringify(envelope({detail:next,accepted:{turn:accepted,streamUrl:next.streamUrl}}))});}};
}
async function historyPanel(page: Page) {
  const panel=page.locator('[aria-label="Task Chat history"], [aria-label="Task Chat history drawer"]').filter({visible:true});
  if(await panel.count())return panel;
  const open=page.getByRole("button",{name:"Open chat history"});if(await open.isVisible())await open.click();
  return panel;
}
async function newDraft(page:Page){const panel=await historyPanel(page);await panel.getByRole("button",{name:"New chat",exact:true}).click();}
const input=(page:Page)=>page.getByRole("textbox",{name:"Message Pritha",exact:true});
const send=(page:Page)=>page.getByRole("button",{name:"Send",exact:true});

for (const viewport of [{width:1440,height:900},{width:390,height:844}]) {
  test(`unconfirmed process recovery checks exit before offering Resume at ${viewport.width}px`,async({page},testInfo)=>{
    await page.setViewportSize(viewport);
    const f=await fixture(page),chat=detail('chat_recovery','Recovery fixture');
    const failed:any=turn({clientMessageId:'recovery',input:[{text:'Preserved agent task'}]},f.files);
    Object.assign(failed,{status:'failed',error:{code:'admission_runtime_exit_unconfirmed',message:'The previous run has not been confirmed stopped.'},executionIntent:{attemptId:'attempt_original'}});
    f.threads.set('chat_recovery',chat);f.histories.set('chat_recovery',[failed]);
    const actions:any[]=[];let stopped=false;
    await page.route('**/threads/chat_recovery/turns/*/recovery',async route=>{
      const body=route.request().postDataJSON();actions.push(body);
      expect(body.expectedAttemptId).toBe('attempt_original');
      if(body.action==='reconcile' && !stopped)return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({apiVersion:'1',error:{code:'admission_runtime_exit_unconfirmed',message:'The previous process is still running. Check again after it stops.',retryable:false,requestId:'fixture-recovery'}})});
      if(body.action==='reconcile')failed.error={code:'resume_confirmation_required',message:'The previous run has stopped. You can now resume.'};
      else {expect(body.action).toBe('resume');failed.status='in_progress';failed.error=null;Object.assign(chat,{activeTurnId:failed.turnId});}
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(envelope({action:body.action,turnId:failed.turnId,detail:chat}))});
    });
    await page.goto('/task-chat?group=my_chats&chat=chat_recovery');
    const actionsPanel=page.getByLabel('Turn recovery actions');
    await expect(actionsPanel.getByRole('button',{name:'Check recovery',exact:true})).toBeVisible();
    await expect(actionsPanel.getByRole('button',{name:'Resume',exact:true})).toHaveCount(0);
    await actionsPanel.getByRole('button',{name:'Check recovery',exact:true}).click();
    await expect(actionsPanel).toContainText('The previous process is still running.');
    await expect(actionsPanel.getByRole('button',{name:'Resume',exact:true})).toHaveCount(0);
    expect(actions.map(row=>row.action)).toEqual(['reconcile']);
    await page.screenshot({path:testInfo.outputPath('recovery-blocked.png'),fullPage:true});
    stopped=true;await actionsPanel.getByRole('button',{name:'Check recovery',exact:true}).click();
    await expect(actionsPanel.getByRole('button',{name:'Resume',exact:true})).toBeVisible();
    expect(actions.map(row=>row.action)).toEqual(['reconcile','reconcile']);
    expect(new Set(actions.map(row=>row.recoveryId)).size).toBe(2);
    await actionsPanel.getByRole('button',{name:'Resume',exact:true}).click();
    await expect.poll(()=>actions.length).toBe(3);expect(actions[2].action).toBe('resume');
    await expect(page.locator('.codex-composer .codex-working-indicator')).toHaveText('Pritha is working');
    expect(f.creates.length).toBe(0);expect(f.messages.length).toBe(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
}

test('global completion and Voice questions update in the background while selection and draft remain intact',async({page})=>{
  const f=await fixture(page),a=detail('chat_a','Task A'),b=detail('chat_b','Task B');
  (a.thread as any).execution={state:'running'};(b.thread as any).execution={state:'queued'};
  f.threads.set('chat_a',a);f.threads.set('chat_b',b);f.histories.set('chat_a',[]);f.histories.set('chat_b',[]);
  const notify=async(changed:string[],groups:any={})=>page.evaluate(({changed,groups})=>{
    const source=(window as any).__ndEventSources.find((s:any)=>s.url==='/api/codex-chat/v1/events'&&s.readyState===1);
    if(!source)throw new Error('summary stream missing');source.dispatchEvent(new MessageEvent('summary.changed',{data:JSON.stringify({changed,groups,reset:false})}));
  },{changed,groups});
  await notify(['chat_a','chat_b']);let panel=await historyPanel(page);await panel.getByRole('button',{name:/Task A/}).click();
  await expect(page).toHaveURL(/chat=chat_a/);await input(page).fill('Preserve my current draft');
  (b.thread as any).execution={state:'completed'};await notify(['chat_b'],{voice_work:{working:0,attention:1}});
  panel=await historyPanel(page);await expect(panel.getByRole('button',{name:/Task B/})).toContainText('Completed');
  await expect(panel.getByRole('tab',{name:/Voice Tasks/})).toContainText('1 need attention');
  await expect(input(page)).toHaveValue('Preserve my current draft');await expect(page).toHaveURL(/chat=chat_a/);
  const answer=turn({clientMessageId:'answer_a',input:[{text:'Original task'}]},f.files);
  (answer.items as any[]).push({id:'answer_item',kind:'assistant_message',status:'completed',message:{id:'answer_item',role:'assistant',markdown:'Background original result',status:'completed',createdAt:now}});
  f.histories.set('chat_a',[answer]);await notify(['chat_a']);
  const close=page.getByRole('button',{name:'Close chat history'});if(await close.isVisible())await close.click();
  await expect(page.getByText('Background original result',{exact:true})).toBeVisible();await expect(input(page)).toHaveValue('Preserve my current draft');
  expect(f.creates.length).toBe(0);expect(f.messages.length).toBe(0);
});

test("two new drafts send independently and a late ACK preserves the selected draft and its text",async({page})=>{
  const f=await fixture(page);await newDraft(page);await input(page).fill("A submitted");await send(page).click();await expect.poll(()=>f.creates.length).toBe(1);
  await newDraft(page);await input(page).fill("B submitted");await send(page).click();await expect.poll(()=>f.creates.length).toBe(2);
  expect(f.creates[0].body.clientThreadId).not.toBe(f.creates[1].body.clientThreadId);
  await input(page).fill("B newer draft");await f.accept(0,"chat_a");await expect(input(page)).toHaveValue("B newer draft");expect(new URL(page.url()).searchParams.has("chat")).toBe(false);
  await f.accept(1,"chat_b");await expect(input(page)).toHaveValue("B newer draft");await expect(send(page)).toBeEnabled();
  await send(page).click();await expect.poll(()=>f.creates.length).toBe(3);expect(f.creates[2].body.clientThreadId).not.toBe(f.creates[1].body.clientThreadId);
  await f.accept(2,"chat_c");await expect(page).toHaveURL(/chat=chat_c/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("original upload survives reload and sends an attachment-only message with a download link",async({page,request})=>{
  const f=await fixture(page);await newDraft(page);
  const bytes=Buffer.from([0,255,13,10,0,128,127,6]);
  await page.getByLabel("Attach original files").setInputFiles({name:"untouched.bin",mimeType:"application/octet-stream",buffer:bytes});
  await expect(page.getByLabel("Draft attachments")).toContainText("Original uploaded");const [id]=f.files.keys();expect(id).toBeTruthy();
  const downloaded=await request.get(`/api/codex-chat/v1/attachments/${id}`);expect(downloaded.ok()).toBe(true);expect(await downloaded.body()).toEqual(bytes);
  await page.reload();await expect(page.getByLabel("Draft attachments")).toContainText("untouched.bin");await expect(send(page)).toBeEnabled();
  await send(page).click();await expect.poll(()=>f.creates.length).toBe(1);expect(f.creates[0].body.initialTurn.input[0].text).toBe("");expect(f.creates[0].body.initialTurn.attachments).toEqual([id]);
  await f.accept(0,"chat_file");await expect(page.getByRole("link",{name:"untouched.bin",exact:true})).toHaveAttribute("href",`/api/codex-chat/v1/attachments/${id}`);
});

test("unknown delivery preserves the immutable original request across reload and newer text",async({page})=>{
  const f=await fixture(page);await newDraft(page);await input(page).fill("Original with trailing space  ");await send(page).click();await expect.poll(()=>f.creates.length).toBe(1);
  const first=structuredClone(f.creates[0].body);await f.creates[0].route.abort("failed");await expect(page.locator(".codex-delivery-unknown")).toBeVisible();
  await input(page).fill("Newer text must survive");await page.reload();await expect(input(page)).toHaveValue("Newer text must survive");
  await page.getByRole("button",{name:"Check and retry same message"}).click();await expect.poll(()=>f.creates.length).toBe(2);expect(f.creates[1].body).toEqual(first);
  await f.accept(1,"chat_reconciled");await expect(input(page)).toHaveValue("Newer text must survive");await expect(send(page)).toBeEnabled();
});

test("interrupted upload retries the saved browser original under the same ID after reload",async({page})=>{
  const f=await fixture(page);await newDraft(page);let interruptedId:string|null=null;
  await page.route("**/api/codex-chat/v1/attachments/*",async route=>{
    if(route.request().method()==="PUT" && !interruptedId){interruptedId=new URL(route.request().url()).pathname.split("/").pop()!;return route.abort("failed");}
    return route.fallback();
  });
  const bytes=Buffer.from("Synthetic untouched source\n\0\u00ff", "utf8");
  await page.getByLabel("Attach original files").setInputFiles({name:"source.txt",mimeType:"text/plain",buffer:bytes});
  await expect(page.getByRole("button",{name:"Retry upload"})).toBeVisible();await expect(send(page)).toBeDisabled();
  await page.reload();await expect(page.getByRole("button",{name:"Retry upload"})).toBeVisible();await page.getByRole("button",{name:"Retry upload"}).click();
  await expect(page.getByLabel("Draft attachments")).toContainText("Original uploaded");expect(Array.from(f.files.keys())).toEqual([interruptedId]);
  const response=await page.request.get(`/api/codex-chat/v1/attachments/${interruptedId}`);expect(await response.body()).toEqual(bytes);
  await page.getByRole("button",{name:"Remove source.txt"}).click();await expect(page.getByLabel("Draft attachments")).not.toContainText("source.txt");
});

test("large originals reach the real upload guard intact and oversized files are rejected",async({request},testInfo)=>{
  const health = await (await request.get("/api/health")).json();
  expect(health.instance?.role).toBe("development");expect(health.instance?.id).toMatch(/fixture|e2e|test/);
  const {createHash,randomUUID}=await import("node:crypto");
  const size=100*1024*1024,id=randomUUID();
  const chunk=Buffer.alloc(1024*1024,0x5a), digest=createHash("sha256");for(let i=0;i<100;i++)digest.update(chunk);
  const base=testInfo.project.use.baseURL!;
  // A bounded Node stream exercises Next proxy buffering without constructing a
  // second 100 MiB browser copy. This fixture never starts a model execution.
  let sent=0;
  const body=new ReadableStream({pull(controller){if(sent===size){controller.close();return;}controller.enqueue(chunk);sent+=chunk.length;}});
  const response=await fetch(`${base}/api/codex-chat/v1/attachments/${id}`,{method:"PUT",headers:{"Content-Length":String(size),"Content-Type":"application/octet-stream","x-attachment-name":"large-original.bin",Origin:base},body,duplex:"half"} as RequestInit);
  expect(response.ok).toBe(true);expect((await response.json()).data.size).toBe(size);
  const original=await fetch(`${base}/api/codex-chat/v1/attachments/${id}`);expect(original.ok).toBe(true);
  const actual=createHash("sha256");let received=0;for await(const part of original.body! as unknown as AsyncIterable<Uint8Array>){actual.update(part);received+=part.byteLength;}
  expect(received).toBe(size);expect(actual.digest("hex")).toBe(digest.digest("hex"));
  const oversizedId=randomUUID();let oversizedSent=0;
  const oversizedBody=new ReadableStream({pull(controller){if(oversizedSent===size+1){controller.close();return;}const part=chunk.subarray(0,Math.min(chunk.length,size+1-oversizedSent));controller.enqueue(part);oversizedSent+=part.length;}});
  const oversized=await fetch(`${base}/api/codex-chat/v1/attachments/${oversizedId}`,{method:"PUT",headers:{"Content-Length":String(size+1),"Content-Type":"application/octet-stream","x-attachment-name":"too-large.bin",Origin:base},body:oversizedBody,duplex:"half",signal:AbortSignal.timeout(30000)} as RequestInit);
  expect(oversized.status).toBe(413);
  expect((await request.get(`/api/codex-chat/v1/attachments/${oversizedId}`)).status()).toBe(404);
});

test("active chat keeps drafts local and previously queued messages remain editable",async({page})=>{
  const f=await fixture(page);await newDraft(page);await input(page).fill("Running predecessor");await send(page).click();await expect.poll(()=>f.creates.length).toBe(1);
  await f.accept(0,"chat_queue");await expect(page).toHaveURL(/chat=chat_queue/);
  const first=f.histories.get("chat_queue")![0];first.status="in_progress";first.completedAt=null;
  Object.assign(f.threads.get("chat_queue")!,{activeTurnId:first.turnId});
  const cancellations:any[]=[],stops:any[]=[];
  await page.route("**/threads/chat_queue/**",async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.endsWith("/queue")) {
      const body=route.request().postDataJSON();cancellations.push(body);
      const saved=f.histories.get("chat_queue")!.find(row=>url.pathname.includes(row.turnId));
      expect(saved.executionIntent.dispatchState).toBe("accepted");expect(body.expectedRevision).toBe(saved.executionIntent.queueRevision);
      saved.status="interrupted";saved.executionIntent.dispatchState="cancelled";saved.executionIntent.queueRevision++;
      saved.error={code:"queued_cancelled",message:"Queued message cancelled before CLI dispatch."};
      return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(envelope({turn:saved,originalText:saved.userMessage.markdown,replayed:false}))});
    }
    if(url.pathname.endsWith("/interrupt")) {stops.push(route.request().postDataJSON());return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(envelope(f.threads.get("chat_queue")))});}
    return route.fallback();
  });
  await page.reload();await input(page).fill("Follow up after A  ");
  await expect(send(page)).toBeDisabled(); await input(page).press("Enter"); expect(f.messages).toHaveLength(0);
  await page.reload(); await expect(input(page)).toHaveValue("Follow up after A  ");
  const queued={...turn({clientMessageId:"previously_queued",input:[{text:"Earlier queued draft  "}]},f.files),status:"queued",executionIntent:{version:1,attemptId:"attempt_queued",predecessorTurnId:first.turnId,queueRevision:1,dispatchState:"accepted"}};
  f.histories.get("chat_queue")!.push(queued);await page.reload();await expect(input(page)).toBeEditable();await input(page).fill("");
  await page.getByRole("button",{name:"Edit queued message",exact:true}).click();
  await expect(input(page)).toHaveValue("Earlier queued draft  ");expect(cancellations).toHaveLength(1);expect(first.status).toBe("in_progress");
  await input(page).fill("Edited follow up");await expect(send(page)).toBeDisabled();
  await page.getByTitle("Interrupt the active NeuralDeep CLI process").click();await expect.poll(()=>stops.length).toBe(1);expect(stops[0].expectedTurnId).toBe(first.turnId);
  first.status="completed";Object.assign(f.threads.get("chat_queue")!,{activeTurnId:null});await page.reload();
  await expect(input(page)).toHaveValue("Edited follow up");await expect(send(page)).toBeEnabled();expect(f.messages).toHaveLength(0);
  await send(page).click();await expect.poll(()=>f.messages.length).toBe(1);
  expect(f.messages[0].body.mode).toBeUndefined();expect(f.messages[0].body.input[0].text).toBe("Edited follow up");
  await f.messages[0].route.fulfill({status:202,contentType:"application/json",body:JSON.stringify(envelope({turn:turn(f.messages[0].body,f.files),streamUrl:"/api/codex-chat/v1/threads/chat_queue/events"}))});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("a typed Voice answer addresses the displayed question and never creates a free task turn",async({page})=>{
  const f=await fixture(page),chat=detail("chat_voiceoperator","Question fixture"),taskId="voice_operator_fixture";
  Object.assign(chat.thread,{origin:"voice",group:"voice_work",status:"waiting_on_input",taskLinks:[{taskId,shortId:"V42",label:"Question fixture",origin:"voice",mode:"result_reference",subjectScope:{kind:"task",id:taskId,label:"Question fixture",generation:3},status:"waiting_for_input",linkedAt:now}]});
  (chat.thread.taskLinks as any[]).push({taskId:"queued_successor",shortId:"V43",label:"Queued successor",origin:"voice",mode:"result_reference",subjectScope:{kind:"task",id:taskId,label:"Question fixture",generation:3},status:"queued",linkedAt:now});
  chat.continuationState="blocked_active_turn";chat.thread.continuationState="blocked_active_turn";f.threads.set(chat.thread.chatId,chat);
  let question:any={request_id:"request_fixture_123456789012345678901234",task_id:taskId,topic_id:"topic_fixture",topic_generation:3,revision:1,kind:"answer",question:"Which synthetic branch?"};
  const answers:any[]=[];
  await page.route(`**/api/realtime/codex-task/${taskId}/operator`,route=>route.fulfill({contentType:"application/json",body:JSON.stringify({ok:true,operator_request:question})}));
  await page.route(`**/api/realtime/codex-task/${taskId}/answer`,route=>{answers.push(route.request().postDataJSON());return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({ok:true,status:"queued"})});});
  await historyPanel(page);await page.getByRole("tab",{name:"Voice Tasks",exact:true}).click();await page.getByRole("button",{name:/Question fixture/}).click();
  const card=page.getByRole("region",{name:"Вопрос задачи"});await expect(card).toContainText("Which synthetic branch?");
  await card.getByRole("textbox",{name:"Ответ на вопрос задачи"}).fill("Keep the original branch.  \nExact answer.");
  question=null;await card.getByRole("button",{name:"Отправить ответ"}).click();await expect.poll(()=>answers.length).toBe(1);
  expect(answers[0]).toEqual({operator_request_id:"request_fixture_123456789012345678901234",topic_generation:3,expected_revision:1,answer:"Keep the original branch.  \nExact answer."});
  expect(f.messages).toHaveLength(0);expect(f.creates).toHaveLength(0);await expect(card).toContainText("Ответ принят Pritha");
});

test("Voice permits a queued typed message while its question stays separate and other drafts stay editable",async({page},testInfo)=>{
  const f=await fixture(page),chat=detail("chat_voicehandoff","Voice handoff fixture"),taskId="voice_handoff_fixture";
  Object.assign(chat.thread,{origin:"voice",group:"voice_work",status:"working",taskLinks:[{taskId,label:"Voice handoff fixture",origin:"voice",mode:"result_reference",subjectScope:{kind:"task",id:taskId,label:"Fixture",generation:4},status:"waiting_for_input",linkedAt:now}]});
  chat.continuationState="blocked_active_turn";chat.thread.continuationState="blocked_active_turn";f.threads.set(chat.thread.chatId,chat);
  let answers=0,activeAttempt:string|null="attempt_voice_handoff_fixture";const stops:unknown[]=[];
  await page.route(`**/api/realtime/codex-task/${taskId}/operator`,route=>route.fulfill({contentType:"application/json",body:JSON.stringify({ok:true,active_attempt_id:activeAttempt,operator_request:activeAttempt?{request_id:"request_voice_handoff_fixture_1234567890",task_id:taskId,topic_id:"topic_fixture",topic_generation:4,revision:1,kind:"answer",question:"Confirm the original scope?"}:null})}));
  await page.route(`**/api/realtime/codex-task/${taskId}/answer`,route=>{answers++;return route.fulfill({status:409,body:"{}"});});
  await page.route(`**/api/realtime/codex-task/${taskId}/abort`,route=>{stops.push(route.request().postDataJSON());activeAttempt=null;return route.fulfill({contentType:"application/json",body:JSON.stringify({ok:true,status:"aborted"})});});
  await historyPanel(page);await page.getByRole("tab",{name:"Voice Tasks",exact:true}).click();await page.getByRole("button",{name:/Voice handoff fixture/}).click();
  await expect(input(page)).toBeEditable();await input(page).fill("After Voice finishes, summarize its result.");
  await page.getByRole("button",{name:"Send after Voice",exact:true}).click();await expect.poll(()=>f.messages.length).toBe(1);
  expect(f.messages[0].body.voiceHandoff).toEqual({taskId,topicGeneration:4});expect(f.messages[0].body.mode).toBe("after_completion");
  const accepted={...turn(f.messages[0].body,f.files),status:"queued",completedAt:null,executionIntent:{version:1,attemptId:"attempt_handoff_fixture",queueRevision:1,dispatchState:"accepted"}};
  f.histories.set(chat.thread.chatId,[accepted]);await f.messages[0].route.fulfill({status:202,contentType:"application/json",body:JSON.stringify(envelope({turn:accepted,streamUrl:chat.streamUrl}))});
  await expect(page.getByRole("region",{name:"Вопрос задачи"})).toContainText("Confirm the original scope?");expect(answers).toBe(0);
  await expect(input(page)).toHaveValue("");await input(page).fill("Another independent draft");
  const queuedSend=page.getByRole("button",{name:"Send after Voice",exact:true});await queuedSend.scrollIntoViewIfNeeded();
  const bounds=await queuedSend.boundingBox(),conversation=await page.locator('.codex-conversation').boundingBox(),heading=await page.locator('.codex-conversation-header').boundingBox();
  expect(heading!.y).toBeGreaterThanOrEqual(0);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(conversation!.y+conversation!.height+2);
  await page.screenshot({path:testInfo.outputPath("voice-queued-handoff.png"),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
  expect(await page.locator('.codex-send').evaluate(button=>button.scrollWidth<=button.clientWidth+2)).toBe(true);
  await page.getByRole("button",{name:"Stop Voice task",exact:true}).click();await expect.poll(()=>stops.length).toBe(1);
  expect(stops[0]).toMatchObject({expected_attempt_id:"attempt_voice_handoff_fixture"});await expect(page.getByRole("region",{name:"Вопрос задачи"})).toContainText("Остановка подтверждена");
  await historyPanel(page);await page.getByRole("tab",{name:"Direct Chats",exact:true}).click();await newDraft(page);await expect(input(page)).toBeEditable();await input(page).fill("New chat is available");expect(f.messages).toHaveLength(1);expect(answers).toBe(0);
});

test("local paths stay readable and Task Chat does not expose agent delivery controls", async ({ page }, testInfo) => {
  const f = await fixture(page);
  const chat = detail("chat_operations", "Task Chat without delivery panel");
  Object.assign(chat.thread.runtime, { sessionId: "native-operation-fixture" });
  f.threads.set(chat.thread.chatId, chat);
  const row = turn({ clientMessageId: "links", input: [{ text: "Local path fixture" }] }, f.files);
  (row.items as any[]).push({ id: "result_links", kind: "assistant_message", createdAt: now, message: { id: "message_links", role: "assistant", status: "completed", createdAt: now, markdown: "See [Outcome](</Users/operator/Fixture/Outcome Spec.md>) and [docs](https://example.org/docs)." } });
  f.histories.set(chat.thread.chatId, [row]);
  const unwantedRequests: string[] = [];
  page.on("request", request => { if (/\/(delivery|operations)(?:[/?]|$)/.test(request.url())) unwantedRequests.push(request.url()); });
  await page.goto("/task-chat?group=my_chats&chat=chat_operations");
  await expect(page.locator(".codex-markdown code", { hasText: "/Users/operator/Fixture/Outcome Spec.md" })).toBeVisible();
  await expect(page.locator('a[href*="/Users/"]')).toHaveCount(0);
  await expect(page.getByRole("link", { name: "docs", exact: true })).toHaveAttribute("href", "https://example.org/docs");
  await expect(page.locator(".codex-delivery-panel")).toHaveCount(0);
  await expect(page.getByText("Сборка агента", { exact: true })).toHaveCount(0);
  expect(unwantedRequests).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("task-chat-without-delivery.png"), fullPage: true });
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 600 }, { width: 390, height: 844 }]) {
  test(`composer stays reachable with a long transcript at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const f = await fixture(page), chat = detail("chat_long", "Long conversation fixture");
    f.threads.set(chat.thread.chatId, chat);
    const row = turn({ clientMessageId: "long", input: [{ text: "Keep the composer in view" }] }, f.files);
    (row.items as any[]).push({ id: "long_answer", kind: "assistant_message", status: "completed", message: { id: "long_answer", role: "assistant", status: "completed", createdAt: now, markdown: Array.from({ length: 150 }, (_, i) => `Paragraph ${i + 1}: long conversation content that must scroll inside its transcript.`).join("\n\n") } });
    f.histories.set(chat.thread.chatId, [row]);
    await page.goto("/task-chat?group=my_chats&chat=chat_long");
    await expect(page.getByText("Paragraph 150:", { exact: false })).toBeAttached();
    await expect(input(page)).toBeEditable();
    const check = async () => {
      const geometry = await page.evaluate(() => {
        const rect = (selector: string) => { const r = document.querySelector(selector)!.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; };
        const transcript = document.querySelector(".codex-transcript")!;
        return { input: rect(".codex-composer textarea"), send: rect(".codex-send"), header: rect(".codex-conversation-header"), conversation: rect(".codex-conversation"), viewport: innerHeight, scrollable: transcript.scrollHeight > transcript.clientHeight, overflow: document.documentElement.scrollWidth > innerWidth + 1 };
      });
      expect(geometry.scrollable).toBe(true);
      expect(geometry.input.top).toBeGreaterThanOrEqual(geometry.header.bottom);
      expect(geometry.send.bottom).toBeLessThanOrEqual(Math.min(geometry.viewport, geometry.conversation.bottom) + 1);
      expect(geometry.input.height).toBeGreaterThan(50);
      expect(geometry.overflow).toBe(false);
    };
    await check();
    await input(page).fill("This draft remains editable while the history scrolls.");
    await page.locator(".codex-transcript").evaluate(element => { element.scrollTop = 0; });
    await check();
    await expect(input(page)).toHaveValue("This draft remains editable while the history scrolls.");
    await page.screenshot({ path: testInfo.outputPath("long-chat-composer.png"), fullPage: true });
    expect(f.messages).toHaveLength(0); expect(f.creates).toHaveLength(0);
  });
}


test("history originals load in place without text links in messages or Activity", async ({ page }) => {
  const f = await fixture(page), chat = detail("chat_originals", "Original text fixture");
  f.threads.set(chat.thread.chatId, chat);
  const row: any = turn({ clientMessageId: "originals", input: [{ text: "User preview" }] }, f.files);
  row.userMessage.contentRef = "user_original";
  row.history = { itemsCursor: "items_original", itemsState: "not_loaded" };
  row.items = [{ id: "answer_original", kind: "assistant_message", status: "completed", message: { id: "answer_original", role: "assistant", status: "completed", createdAt: now, markdown: "Answer preview", contentRef: "answer_original" } }];
  f.histories.set(chat.thread.chatId, [row]);
  const reads: string[] = [];
  await page.route("**/threads/chat_originals/history/**", route => {
    const url = new URL(route.request().url()), cursor = url.searchParams.get("cursor");
    const sendPage = (data: unknown) => route.fulfill({ contentType: "application/json", body: JSON.stringify(envelope(data)) });
    if (url.pathname.endsWith("/items")) return sendPage({ data: [{ id: "command_original", kind: "command", status: "completed", commandPreview: "echo preview", contentRef: "command_original" }], nextCursor: null });
    reads.push(cursor!);
    if (cursor === "user_original") return sendPage({ text: "Complete user message", nextCursor: null, complete: true });
    if (cursor === "answer_original") return sendPage({ text: "Complete assistant ", nextCursor: "answer_tail", complete: false });
    if (cursor === "answer_tail") return sendPage({ text: "message", nextCursor: null, complete: true });
    if (cursor === "command_original") return sendPage({ text: "Complete command output", nextCursor: null, complete: true });
    return route.fulfill({ status: 404, body: "{}" });
  });
  await page.goto("/task-chat?group=my_chats&chat=chat_originals");
  await expect(page.getByText("Complete user message", { exact: true })).toBeVisible();
  await expect(page.getByText("Complete assistant message", { exact: true })).toBeVisible();
  expect(reads).not.toContain("command_original");
  await expect(page.getByText("echo preview", { exact: true })).toHaveCount(0);
  await page.getByRole("region", { name: "Activity", exact: true }).getByText("Details", { exact: true }).click();
  await expect(page.getByText("Complete command output", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Read original text|Read more text|Written original text/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Read original text|Read more text|Written original text/i })).toHaveCount(0);
  expect(reads).toEqual(expect.arrayContaining(["user_original", "answer_original", "answer_tail", "command_original"]));
  expect(f.messages).toHaveLength(0); expect(f.creates).toHaveLength(0);
});


test("long original text loads at its visible end while Copy includes every chunk", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const f = await fixture(page), chat = detail("chat_progressive", "Progressive text fixture");
  f.threads.set(chat.thread.chatId, chat);
  const row: any = turn({ clientMessageId: "progressive", input: [{ text: "Show the complete response" }] }, f.files);
  row.history = { itemsCursor: "items_progressive", itemsState: "not_loaded" };
  row.items = [{ id: "progressive_answer", kind: "assistant_message", status: "completed", message: { id: "progressive_answer", role: "assistant", status: "completed", createdAt: now, markdown: "Short response preview", contentRef: "progressive_first" } }];
  f.histories.set(chat.thread.chatId, [row]);
  const first = Array.from({ length: 200 }, (_, i) => `Part ${i + 1}. The full original stays intact while its next section waits below the viewport.`).join("\n\n") + "\n\n";
  const tail = "Final original section: Привет 🙂\n\nThis is the exact ending.\n";
  const reads: string[] = [];
  await page.route("**/threads/chat_progressive/history/**", route => {
    const url = new URL(route.request().url()), cursor = url.searchParams.get("cursor");
    const sendPage = (data: unknown) => route.fulfill({ contentType: "application/json", body: JSON.stringify(envelope(data)) });
    if (url.pathname.endsWith("/items")) return sendPage({ data: row.items, nextCursor: null });
    reads.push(cursor!);
    if (cursor === "progressive_first") return sendPage({ text: first, nextCursor: "progressive_tail", complete: false });
    if (cursor === "progressive_tail") return sendPage({ text: tail, nextCursor: null, complete: true });
    return route.fulfill({ status: 404, body: "{}" });
  });
  await page.goto("/task-chat?group=my_chats&chat=chat_progressive");
  await expect(page.getByText("Part 1.", { exact: false })).toBeAttached();
  await page.waitForTimeout(200);
  expect(reads).toEqual(["progressive_first"]);
  await expect(page.getByText("This is the exact ending.", { exact: true })).toHaveCount(0);
  // Trigger Copy in the user gesture without scrolling its bottom-of-turn button
  // into view, which would also trigger the text end sentinel.
  await page.getByRole("button", { name: "Copy response", exact: true }).evaluate(button => (button as HTMLButtonElement).click());
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(first + tail);
  expect(reads).toEqual(["progressive_first", "progressive_first", "progressive_tail"]);
  await expect(page.getByText("This is the exact ending.", { exact: true })).toHaveCount(0);
  await page.locator(".codex-transcript").evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(page.getByText("This is the exact ending.", { exact: true })).toBeVisible();
  expect(reads).toEqual(["progressive_first", "progressive_first", "progressive_tail", "progressive_tail"]);
  expect(Buffer.byteLength(JSON.stringify(envelope({ text: first, nextCursor: "progressive_tail", complete: false })))).toBeLessThan(64 * 1024);
  expect(f.messages).toHaveLength(0); expect(f.creates).toHaveLength(0);
});

test("visible text reads share two slots and switching chats cancels old reads and queued work", async ({ page }) => {
  const f = await fixture(page), oldChat = detail("chat_pool", "Original text pool"), newChat = detail("chat_pool_new", "Selected new chat");
  f.threads.set(oldChat.thread.chatId, oldChat); f.threads.set(newChat.thread.chatId, newChat);
  const row: any = turn({ clientMessageId: "pool", input: [{ text: "Short user preview" }] }, f.files);
  row.userMessage.contentRef = "pool_user"; row.history = { itemsCursor: "pool_items", itemsState: "not_loaded" };
  row.items = [1, 2, 3].map(n => ({ id: `pool_answer_${n}`, kind: "assistant_message", status: "completed", message: { id: `pool_answer_${n}`, role: "assistant", status: "completed", createdAt: now, markdown: `Short answer ${n}`, contentRef: `pool_answer_${n}` } }));
  f.histories.set(oldChat.thread.chatId, [row]);
  const newRow: any = turn({ clientMessageId: "poolnew", input: [{ text: "New user preview" }] }, f.files);
  newRow.userMessage.contentRef = "new_original"; newRow.history = { itemsCursor: "new_items", itemsState: "not_loaded" }; f.histories.set(newChat.thread.chatId, [newRow]);
  const pending: Route[] = [], failed: string[] = [], reads: string[] = [];
  page.on("requestfailed", request => { if (request.url().includes("/chat_pool/history/")) failed.push(request.url()); });
  await page.route("**/threads/chat_pool/history/items/*/content?**", route => { reads.push(new URL(route.request().url()).searchParams.get("cursor")!); pending.push(route); });
  await page.route("**/threads/chat_pool_new/history/items/*/content?**", route => route.fulfill({ contentType: "application/json", body: JSON.stringify(envelope({ text: "The selected chat loads after cancellation", nextCursor: null, complete: true })) }));
  await page.goto("/task-chat?group=my_chats&chat=chat_pool");
  await expect.poll(() => pending.length).toBe(2);
  await page.waitForTimeout(200); expect(reads).toHaveLength(2);
  const panel = await historyPanel(page); await panel.getByRole("button", { name: /Selected new chat/ }).click();
  await expect(page.getByText("The selected chat loads after cancellation", { exact: true })).toBeVisible();
  await expect.poll(() => failed.length).toBe(2);
  expect(reads).toHaveLength(2);
  for (const route of pending) await route.fulfill({ contentType: "application/json", body: JSON.stringify(envelope({ text: "Old chat completion must not replace selected text", nextCursor: null, complete: true })) }).catch(() => undefined);
  await expect(page.getByText("Old chat completion must not replace selected text", { exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/chat=chat_pool_new/);
  expect(f.messages).toHaveLength(0); expect(f.creates).toHaveLength(0);
});


for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`working indicator stays in the composer while typing and follows only the selected chat at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const f = await fixture(page), active = detail("chat_working", "Active indicator fixture"), other = detail("chat_indicator_other", "Completed indicator fixture");
    const row: any = turn({ clientMessageId: "working", input: [{ text: "Working request" }] }, f.files);
    row.status = "in_progress"; row.completedAt = null;
    Object.assign(active, { activeTurnId: row.turnId });
    f.threads.set(active.thread.chatId, active); f.threads.set(other.thread.chatId, other);
    f.histories.set(active.thread.chatId, [row]); f.histories.set(other.thread.chatId, []);
    const notify = () => page.evaluate(() => {
      const source = (window as any).__ndEventSources.find((candidate: any) => candidate.url === "/api/codex-chat/v1/events" && candidate.readyState === 1);
      source.dispatchEvent(new MessageEvent("summary.changed", { data: JSON.stringify({ changed: ["chat_working"], groups: {}, reset: false }) }));
    });
    await page.goto("/task-chat?group=my_chats&chat=chat_working");
    const indicator = page.locator(".codex-composer .codex-working-indicator");
    await expect(input(page)).toBeEditable();
    await expect(indicator).toContainText("Pritha is working");
    await expect(page.locator(".codex-transcript .codex-thinking")).toHaveCount(0);
    await expect(input(page)).toHaveAttribute("placeholder", "");
    const fieldBounds=await input(page).boundingBox(), indicatorBounds=await indicator.boundingBox();
    expect(Math.abs(indicatorBounds!.x-fieldBounds!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(indicatorBounds!.y-fieldBounds!.y)).toBeLessThanOrEqual(1);
    const appearance=await input(page).evaluate(el=>({size:getComputedStyle(el).fontSize,color:getComputedStyle(el,"::placeholder").color}));
    expect(await indicator.evaluate(el=>({size:getComputedStyle(el).fontSize,color:getComputedStyle(el).color}))).toEqual(appearance);
    await page.mouse.click(fieldBounds!.x+20,fieldBounds!.y+10);await expect(input(page)).toBeFocused();
    await page.screenshot({path:testInfo.outputPath("working-placeholder.png"),fullPage:true});
    await input(page).fill("My next message stays editable during the work.");
    await expect(indicator).toHaveCSS("opacity", "0");
    await input(page).press("Enter");expect(f.messages).toHaveLength(0);
    const dots = indicator.locator(".codex-working-dots > span");
    await expect(dots).toHaveCount(3);
    expect(await dots.evaluateAll(elements => elements.map(element => getComputedStyle(element).animationDelay))).toEqual(["0s", "0.16s", "0.32s"]);
    expect(await dots.evaluateAll(elements => elements.map(element => getComputedStyle(element).animationName))).toEqual(["codex-working-dot", "codex-working-dot", "codex-working-dot"]);
    await expect(indicator.locator(".codex-working-dots")).toHaveAttribute("aria-hidden", "true");
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await dots.evaluateAll(elements => elements.map(element => getComputedStyle(element).animationName))).toEqual(["none", "none", "none"]);
    await expect(indicator).toHaveText("Pritha is working");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(send(page)).toBeDisabled();
    await expect(input(page)).toHaveAttribute("placeholder", "");
    await page.screenshot({ path: testInfo.outputPath("composer-working-while-typing.png"), fullPage: true });
    const panel = await historyPanel(page); await panel.getByRole("button", { name: /Completed indicator fixture/ }).click();
    await expect(page).toHaveURL(/chat=chat_indicator_other/);
    await expect(page.locator(".codex-working-indicator")).toBeEmpty();
    const panelAgain = await historyPanel(page); await panelAgain.getByRole("button", { name: /Active indicator fixture/ }).click();
    await expect(indicator).toBeVisible();
    await expect(input(page)).toHaveValue("My next message stays editable during the work.");
    for (const status of ["waiting_for_input", "waiting_for_approval", "completed"]) {
      row.status = status; if (status === "completed") Object.assign(active, { activeTurnId: null });
      await notify(); await expect(page.getByLabel(`Turn ${status}`, { exact: true })).toBeAttached(); await expect(indicator).toBeEmpty();
      await expect(input(page)).toHaveValue("My next message stays editable during the work.");
    }
    row.status = "queued"; await notify(); await expect(indicator).toContainText("In queue");
    row.status = "waiting_for_provider"; await notify(); await expect(indicator).toContainText("Waiting for provider");
    row.status = "in_progress"; await notify(); await expect(indicator).toContainText("Pritha is working");
    expect(f.messages).toHaveLength(0); expect(f.creates).toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}


for (const width of [1440,390]) test(`archive actions stay under the selected task and preserve drafts at ${width}px`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:900});
  const f=await fixture(page),chat:any=detail("chat_archive","Archive fixture"),other:any=detail("chat_other","Other active task");
  chat.revision=7;other.revision=1;
  f.threads.set(chat.thread.chatId,chat);f.threads.set(other.thread.chatId,other);
  const actions:any[]=[];
  await page.route("**/threads/chat_archive/*",async route=>{
    const action=new URL(route.request().url()).pathname.split("/").at(-1);
    if(!["archive","unarchive"].includes(action!))return route.fallback();
    const body=route.request().postDataJSON();actions.push({action,...body});
    expect(body.expectedRevision).toBe(chat.revision);
    expect(route.request().headers()["idempotency-key"]).toBe(body.requestId);
    chat.thread.archived=action==="archive";chat.revision++;
    return route.fulfill({json:envelope(chat)});
  });
  await page.goto("/task-chat?group=my_chats&chat=chat_archive");
  await input(page).fill("Preserve my unsent task");
  let panel=await historyPanel(page);
  await expect(panel.getByRole("checkbox",{name:"Show archived"})).toHaveCount(0);
  await expect(panel.getByRole("button",{name:"Show archived",exact:true})).toBeVisible();
  await expect(panel.getByRole("button",{name:"Archive",exact:true})).toHaveCount(1);
  const entry=panel.locator('.codex-thread-entry').filter({has:page.getByRole("button",{name:/Archive fixture/})});
  await expect(entry.getByRole("button",{name:"Archive",exact:true})).toBeVisible();
  await expect(page.locator('.codex-conversation-header').getByRole("button",{name:/Archive|Restore|Resume/i})).toHaveCount(0);
  await entry.getByRole("button",{name:"Archive",exact:true}).click();
  await expect(panel.getByRole("button",{name:/Archive fixture/})).toHaveCount(0);
  await expect(panel.getByRole("button",{name:/Other active task/})).toBeVisible();
  await panel.getByRole("button",{name:"Show archived",exact:true}).click();
  await expect(panel.getByRole("button",{name:/Other active task/})).toHaveCount(0);
  await expect(panel.getByRole("button",{name:"Show active",exact:true})).toBeVisible();
  await expect(panel.getByRole("button",{name:"Restore from archive",exact:true})).toBeEnabled();
  await expect(panel.getByRole("button",{name:"Archive",exact:true})).toHaveCount(0);
  await expect(page.locator('.codex-conversation-header').getByRole("button",{name:/Archive|Restore|Resume/i})).toHaveCount(0);
  await page.screenshot({path:testInfo.outputPath("archived-task.png"),fullPage:true});
  await panel.getByRole("button",{name:"Restore from archive",exact:true}).click();
  await expect(panel.getByText("No archived chats.",{exact:true})).toBeVisible();
  await panel.getByRole("button",{name:"Show active",exact:true}).click();
  await panel.getByRole("button",{name:/Archive fixture/}).click();
  await expect(input(page)).toHaveValue("Preserve my unsent task");
  expect(actions.map(a=>a.action)).toEqual(["archive","unarchive"]);
  expect(f.creates).toHaveLength(0);expect(f.messages).toHaveLength(0);
});

test("an unresolved new draft does not take selection away from active or archived chats",async({page})=>{
  const f=await fixture(page),chat:any=detail("chat_selected","Selected task"),archived:any=detail("chat_saved","Saved task");
  chat.revision=1;archived.revision=1;archived.thread.archived=true;
  f.threads.set(chat.thread.chatId,chat);f.threads.set(archived.thread.chatId,archived);
  await newDraft(page);await input(page).fill("First message to reconcile");await send(page).click();
  await expect.poll(()=>f.creates.length).toBe(1);await f.creates[0].route.abort("failed");
  await expect(page.getByText("Check delivery",{exact:true})).toBeVisible();
  await page.goto("/task-chat?group=my_chats&chat=chat_selected");
  let panel=await historyPanel(page);
  await expect(panel.getByText("Check delivery",{exact:true})).toBeVisible();
  await expect(panel.getByRole("button",{name:"Archive",exact:true})).toBeEnabled();
  await panel.getByRole("button",{name:"Show archived",exact:true}).click();
  await expect(panel.getByRole("button",{name:"Restore from archive",exact:true})).toBeEnabled();
  await expect(page.locator(".codex-conversation-heading h1")).toHaveText("Saved task");
  await panel.getByRole("button",{name:"Show active",exact:true}).click();
  await expect(panel.getByRole("button",{name:"Archive",exact:true})).toBeEnabled();
  await panel.getByRole("button",{name:/First message to reconcile/}).click();
  await expect(input(page)).toHaveValue("First message to reconcile");
  expect(f.creates).toHaveLength(1);expect(f.messages).toHaveLength(0);
});

test("late active-list responses cannot replace the archive view",async({page})=>{
  const f=await fixture(page),chat:any=detail("chat_late_active","Active task"),archived:any=detail("chat_archived","Archived task");
  chat.revision=1;archived.revision=1;archived.thread.archived=true;
  f.threads.set(chat.thread.chatId,chat);f.threads.set(archived.thread.chatId,archived);
  await page.goto("/task-chat?group=my_chats&chat=chat_late_active");
  const panel=await historyPanel(page);await expect(panel.getByRole("button",{name:"Archive",exact:true})).toBeEnabled();
  let pending:Route|null=null;
  await page.route("**/api/codex-chat/v1/threads?**",route=>{
    const url=new URL(route.request().url());
    if(url.searchParams.get("archived")==="true")return route.fulfill({json:envelope({data:[archived.thread],nextCursor:null})});
    pending=route;
  });
  await page.evaluate(()=>{for(const source of (window as any).__ndEventSources.filter((source:any)=>source.url.endsWith('/v1/events')))source.dispatchEvent(new MessageEvent('summary.changed',{data:JSON.stringify({groups:{}})}));});
  await expect.poll(()=>Boolean(pending)).toBe(true);
  await panel.getByRole("button",{name:"Show archived",exact:true}).click();
  await expect(panel.getByRole("button",{name:"Restore from archive",exact:true})).toBeEnabled();
  await pending!.fulfill({json:envelope({data:[chat.thread],nextCursor:null})});
  await expect(panel.getByRole("button",{name:/Archived task/})).toBeVisible();
  await expect(panel.getByRole("button",{name:/Active task/})).toHaveCount(0);
  await expect(page.locator(".codex-conversation-heading h1")).toHaveText("Archived task");
});

test("archive failure preserves selection and access recovery stays outside the header",async({page})=>{
  const f=await fixture(page),chat:any=detail("chat_archive_failure","Retained task");
  chat.revision=4;chat.history={state:"available",restoreAvailable:true,proofHash:"verified-proof"};
  f.threads.set(chat.thread.chatId,chat);
  await page.route("**/threads/chat_archive_failure/archive",route=>route.fulfill({status:409,json:{apiVersion:"1",error:{code:"history_revision_conflict",message:"The chat changed. Refresh before archiving.",requestId:"conflict",retryable:true}}}));
  let restored=false;
  await page.route("**/threads/chat_archive_failure/restore-access",route=>{
    const body=route.request().postDataJSON();expect(body.expectedRevision).toBe(4);expect(body.proofHash).toBe("verified-proof");
    restored=true;chat.history.restoreAvailable=false;chat.revision++;
    return route.fulfill({json:envelope(chat)});
  });
  await page.goto("/task-chat?group=my_chats&chat=chat_archive_failure");
  const panel=await historyPanel(page);
  await panel.getByRole("button",{name:"Archive",exact:true}).click();
  await expect(page.getByText("The chat changed. Refresh before archiving.",{exact:true})).toBeVisible();
  await expect(panel.getByRole("button",{name:/Retained task/})).toBeVisible();
  await expect(page).toHaveURL(/chat=chat_archive_failure/);
  await expect(page.locator('.codex-conversation-header').getByRole("button",{name:/Archive|Restore|Resume/i})).toHaveCount(0);
  await page.getByRole("button",{name:"Restore access",exact:true}).click();
  await expect.poll(()=>restored).toBe(true);
  await expect(page.getByRole("button",{name:"Restore access",exact:true})).toHaveCount(0);
  expect(f.messages).toHaveLength(0);expect(f.creates).toHaveLength(0);
});

for (const width of [1280, 390]) for (const history of [false, true]) test(`response icons and latest activity at ${width}px (${history ? "history" : "live"})`, async ({ page }, testInfo) => {
  await page.setViewportSize({width,height:850});
  await page.addInitScript(() => Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async(text:string)=>{(window as any).copiedText=text;}}}));
  const f=await fixture(page);f.threads.set("chat_activity",detail("chat_activity","Activity fixture"));
  const actions:any[]=Array.from({length:12},(_,i)=>({id:`action_${i+1}`,kind:"command",status:"completed",commandPreview:`Action ${i+1}`,outputPreview:null,exitCode:0}));
  actions[10]={id:"action_11",kind:"assistant_message",status:"completed",message:{id:"action_11",phase:"commentary",markdown:"I am checking the result for you.",status:"completed",role:"assistant"}};
  const answer={id:"answer_complete",kind:"assistant_message",status:"completed",message:{id:"answer_complete",markdown:"Answer complete",status:"completed",role:"assistant",createdAt:new Date().toISOString()}};
  const row:any={turnId:"turn_activity",status:"completed",userMessage:{id:"user",markdown:"Run the activity fixture",role:"user",status:"completed"},items:history?[answer]:[...actions,answer],pendingRequestIds:[],startedAt:new Date().toISOString(),...(history?{history:{itemsCursor:"recent_actions",itemsState:"not_loaded",sourceMode:"native"}}:{})};
  const reads:string[]=[];
  await page.route("**/threads/chat_activity/history**",route=>{
    const url=new URL(route.request().url());let data:any;
    if(url.pathname.endsWith("/items")){
      if(url.searchParams.get("view")==="activity"){
        const cursor=url.searchParams.get("cursor")!;reads.push(cursor);
        const end=cursor==="recent_actions"?12:Number(cursor.slice(6));const start=Math.max(0,end-5);
        data={data:actions.slice(start,end).reverse(),nextCursor:start?`older_${start}`:null};
      }else data={data:[actions[10],answer],nextCursor:null};
    }else data={data:[row],olderCursor:null,newerCursor:null,hasOlder:false,hasNewer:false,completeness:"captured-from-creation"};
    return route.fulfill({json:{apiVersion:"1",requestId:"activity-fixture",data}});
  });
  await page.goto("/task-chat?group=my_chats&chat=chat_activity");
  const feed=page.getByRole("region",{name:"Activity",exact:true});
  await expect(feed.locator('[data-activity-id="action_12"]')).toBeVisible();
  await expect(feed.locator('[data-activity-id="action_7"]')).toHaveCount(0);
  await expect.poll(async()=>{
    const latestBounds=await feed.locator('[data-activity-id="action_12"]').boundingBox();
    const transcriptBounds=await page.locator(".codex-transcript").boundingBox();
    return latestBounds!.y+latestBounds!.height <= transcriptBounds!.y+transcriptBounds!.height+1;
  }).toBe(true);
  await expect(feed.getByText("Action 12",{exact:true})).toHaveCount(0);
  await expect(feed.getByText("I am checking the result for you.",{exact:true})).toBeVisible();
  await expect(page.locator('.codex-assistant-message').getByText("I am checking the result for you.",{exact:true})).toHaveCount(0);
  const latestAction=feed.locator('[data-activity-id="action_12"]');
  await expect(latestAction.getByText("Command · completed",{exact:true})).toBeVisible();
  await latestAction.getByText("Details",{exact:true}).click();
  await expect(latestAction.getByText("Action 12",{exact:true})).toBeVisible();
  await latestAction.getByText("Details",{exact:true}).click();
  await expect(latestAction.getByText("Action 12",{exact:true})).toHaveCount(0);
  await page.screenshot({path:testInfo.outputPath("latest-activity.png"),fullPage:true});
  const copy=page.getByRole("button",{name:"Copy response",exact:true});
  await expect(copy).toBeVisible();await expect(copy).toHaveText("");await expect(copy.locator("svg")).toHaveCount(1);
  await copy.click();await expect.poll(()=>page.evaluate(()=>(window as any).copiedText)).toBe("I am checking the result for you.\n\nAnswer complete");
  await expect(page.getByText("Copied",{exact:true})).toHaveCount(0);
  if(history) { expect(reads.length).toBeGreaterThan(0); expect(reads.every(cursor=>cursor==="recent_actions")).toBe(true); }
  await feed.getByRole("button",{name:/Show earlier actions/}).click();
  await expect(feed.locator('[data-activity-id="action_3"]')).toBeVisible();
  const early=await feed.locator('[data-activity-id="action_3"]').boundingBox(),latest=await feed.locator('[data-activity-id="action_12"]').boundingBox();
  expect(early!.y).toBeLessThan(latest!.y);
  await feed.getByRole("button",{name:/Show earlier actions/}).click();
  await expect(feed.locator('[data-activity-id="action_1"]')).toBeAttached();
  await expect(feed.getByRole("button",{name:/Show earlier actions/})).toHaveCount(0);
  await page.screenshot({path:testInfo.outputPath("response-activity.png"),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  row.status="in_progress";await page.reload();
  await expect(page.getByText("Answer complete",{exact:true})).toBeVisible();
  await expect(copy).toHaveCount(0);
});

test("Agents refreshes server addresses on first opening without a focus event", async ({ page }) => {
  const health=await(await page.request.get("/api/health")).json();
  expect(health.instance.role).toBe("development");
  const current=await(await page.request.get("/api/status")).json();
  const agent={id:"fixture_current_address",name:"Current server address",mission:"Read-only browser fixture",version:"v1",versionStatus:"available",
    ui:{state:"alive",activity:"active",primaryAction:"check",updateStatus:"none"},url:{status:"available",local:"http://127.0.0.1:3456"},health:{status:"ok"},
    readiness:{runtime:{manager:"process",status:"ready"}},credentials:{status:"unavailable",required:0,missingRequired:0,definitions:[]},
    lifecycle:{delivery:{status:"none"},outcome:{status:"missing"},rollback:{status:"unavailable"},snapshotPlan:{status:"unavailable"},snapshots:{status:"unavailable",count:0},restorePlan:{status:"unavailable"}}};
  let reads=0;
  await page.route("**/api/status",route=>{reads+=1;return route.fulfill({json:{...current,childAgents:[agent]}});});
  await page.goto("/agents");
  const card=page.locator(".agent-card:visible,.mobile-agent-card:visible").filter({has:page.getByRole("heading",{name:agent.name,exact:true})});
  await expect(card.getByRole("link",{name:`Open URL for ${agent.name}`})).toHaveAttribute("href",agent.url.local);
  await expect(card.getByRole("button",{name:`Copy URL for ${agent.name}`})).toBeVisible();
  expect(reads).toBeGreaterThan(0);
});

test("Activity renews expired positions, preserves messages and keeps technical text inside Details",async({page})=>{
  const f=await fixture(page);f.threads.set("chat_recovery_activity",detail("chat_recovery_activity","Activity recovery"));
  let readExpired=false, unavailable=false, contentReads=0;
  const requests:string[]=[];
  const answer:any={id:"answer",kind:"assistant_message",status:"completed",message:{id:"answer",role:"assistant",markdown:"Final answer remains here.",status:"completed"}};
  const progress:any={id:"progress",kind:"assistant_message",status:"completed",message:{id:"progress",role:"assistant",phase:"commentary",markdown:"Progress stays visible.",status:"completed"}};
  const command:any={id:"command",kind:"command",status:"failed",commandPreview:"node hidden_command",outputPreview:null,contentRef:"command_body"};
  const row:any={turnId:"turn_recovery",status:"completed",userMessage:{id:"user",role:"user",markdown:"Keep this request.",status:"completed"},items:[answer],pendingRequestIds:[],startedAt:new Date().toISOString(),history:{itemsCursor:"expired_tail",itemsState:"not_loaded"}};
  await page.route("**/threads/chat_recovery_activity/history**",route=>{
    const url=new URL(route.request().url());
    if(url.pathname.endsWith('/content')){contentReads++;return route.fulfill({json:{apiVersion:"1",requestId:"body",data:{text:"node hidden_command\n\nComplete command output.",nextCursor:null,complete:true}}});}
    if(url.pathname.endsWith('/items')){
      const ref=url.searchParams.get('cursor')!;requests.push(ref);
      if(ref!=="fresh_tail" || unavailable){readExpired=true;return route.fulfill({status:409,json:{apiVersion:"1",error:{code:"history_cursor_expired",message:"This history position has expired. Reload recent messages; displayed text is preserved.",retryable:true,requestId:"expired"}}});}
      return route.fulfill({json:{apiVersion:"1",requestId:"activity",data:{data:[command,progress],nextCursor:"expired_earlier"}}});
    }
    return route.fulfill({json:{apiVersion:"1",requestId:"history",data:{data:[{...row,history:{...row.history,itemsCursor:readExpired?"fresh_tail":"expired_tail"}}],olderCursor:null}}});
  });
  await page.goto('/task-chat?group=my_chats&chat=chat_recovery_activity');
  const feed=page.getByRole('region',{name:'Activity',exact:true}),draft=page.getByRole('textbox',{name:'Message Pritha',exact:true});
  await expect(feed.getByText('Progress stays visible.',{exact:true})).toBeVisible();
  await expect(page.getByText('Final answer remains here.',{exact:true})).toBeVisible();
  await expect(feed.getByText('Command · failed',{exact:true})).toBeVisible();
  expect(contentReads).toBe(0);
  await expect(feed.getByText('node hidden_command',{exact:true})).toHaveCount(0);
  const entry=feed.locator('[data-activity-id="command"]');
  await entry.getByText('Details',{exact:true}).click();
  await expect(entry).toContainText('Complete command output.');expect(contentReads).toBe(1);
  await entry.getByText('Details',{exact:true}).click();
  await expect(entry.getByText('Complete command output.',{exact:false})).toHaveCount(0);
  await draft.fill('Preserve my next message.');
  unavailable=true;const before=requests.length;
  await feed.getByRole('button',{name:/Show earlier actions/}).click();
  await expect(feed.getByText('Activity could not be refreshed. Your messages are still available.',{exact:false})).toBeVisible();
  expect(requests.length-before).toBeLessThanOrEqual(3);
  await expect(feed.getByText('Progress stays visible.',{exact:true})).toBeVisible();
  await expect(page.getByText('This history position has expired.',{exact:false})).toHaveCount(0);
  await expect(draft).toHaveValue('Preserve my next message.');
  unavailable=false;await feed.getByRole('button',{name:'Retry activity',exact:true}).click();
  await expect(feed.getByRole('button',{name:'Retry activity',exact:true})).toHaveCount(0);
  await expect(feed.locator('.codex-activity-entry')).toHaveCount(2);
  await expect(draft).toHaveValue('Preserve my next message.');
});
