import { setTimeout as delay } from "node:timers/promises";
import { coordinationHash, NeuralDeepCoordinationStore, neuralDeepCoordinationPaths } from "../../../../../scripts/neuraldeep/coordination-store.mjs";
import { handoffRequestHash } from "../../../../../scripts/neuraldeep/handoff-barriers.mjs";
import { neuralDeepSessionKey } from "../../../../../scripts/neuraldeep/runtime-identity.mjs";
import type { CodexChatPrivateStore, ChatBinding } from "./private-store";
import type { VoiceTopicStore } from "./voice-topic-store";
import type { ExecutionIntent, TurnView } from "./types";

// The history receipt is durable before the admission fence. A crash in between
// leaves an unresolved input for explicit recovery, never permission to spawn.
export class QueuedVoiceHandoff {
  constructor(private chats:CodexChatPrivateStore, private topics:VoiceTopicStore, private root:string) {}
  private coordination() {return new NeuralDeepCoordinationStore(neuralDeepCoordinationPaths(this.chats.stateRoot,this.root));}

  async accept(binding:ChatBinding,input:{taskId:string;topicGeneration:number},turn:TurnView,save:()=>Promise<boolean>) {
    if(binding.origin!=="voice" || !binding.voiceTopicId || !Number.isSafeInteger(input.topicGeneration)
      || !binding.taskLinks.some(link=>link.taskId===input.taskId && link.subjectScope?.generation===input.topicGeneration)) throw new Error("voice_handoff_context_changed");
    return this.topics.withTopic(binding.voiceTopicId,input.topicGeneration,async topic=>{
      if(topic.chatId!==binding.chatId || topic.stateIdentityHash!==binding.stateIdentityHash)throw new Error("voice_handoff_context_changed");
      const journal=this.coordination();
      try {
        const topicScope=coordinationHash(topic.topicId),previous=journal.handoffs.forScope(topicScope);
        const context={chatId:binding.chatId,topicGeneration:input.topicGeneration,profileIdentity:binding.profileIdentity};
        if(previous && JSON.stringify(previous.context)!==JSON.stringify(context))throw new Error("voice_handoff_context_changed");
        const predecessors=[...new Set([topic.activeTaskId,...topic.queuedTaskIds].filter((id):id is string=>Boolean(id)))];
        if(!predecessors.length && topic.lastTaskId)predecessors.push(topic.lastTaskId);
        const reservation={id:`handoff_${turn.turnId}`,owner:turn.turnId,topicScope,
          sessionScope:topic.sessionId?neuralDeepSessionKey(this.chats.stateRoot,topic.sessionId):null,predecessors,context};
        const barrier=previous || {...reservation,requestHash:handoffRequestHash(reservation)};
        turn.executionIntent!.voiceHandoff={id:barrier.id,requestHash:barrier.requestHash,topicId:topic.topicId,topicGeneration:input.topicGeneration};
        if(!await save())return;
        if(previous)journal.handoffs.join(previous.id,previous.requestHash,turn.turnId,handoffRequestHash({...reservation,predecessors:previous.predecessors}));
        else journal.handoffs.reserve(reservation);
      } finally {journal.close();}
    });
  }

  async wait(chatId:string,intent:ExecutionIntent,signal:AbortSignal) {
    const handoff=intent.voiceHandoff;
    if(!handoff)return;
    const history=await this.chats.historyStore();
    while(true) {
      signal.throwIfAborted();
      let preceding=intent.predecessorTurnId?history.turnState(chatId,intent.predecessorTurnId):null;
      for(let depth=0;preceding?.error?.code==="queued_cancelled" && preceding.executionIntent?.predecessorTurnId && depth<100;depth++)preceding=history.turnState(chatId,preceding.executionIntent.predecessorTurnId);
      if(preceding && ["queued","in_progress","waiting_for_provider","waiting_for_input","waiting_for_approval"].includes(preceding.status)) {
        await delay(250,undefined,{signal,ref:false});continue;
      }
      if(intent.predecessorTurnId && (!preceding || (preceding.status!=="completed" && preceding.error?.code!=="queued_cancelled")))throw new Error("handoff_predecessor_unconfirmed");
      const ready=await this.topics.withTopic(handoff.topicId,handoff.topicGeneration,async topic=>{
        signal.throwIfAborted();
        const journal=this.coordination();
        try {
          const barrier=journal.handoffs.get(handoff.id),binding=history.get(chatId,{turnLimit:0});
          if(!barrier || barrier.requestHash!==handoff.requestHash || !["reserved","ready"].includes(barrier.state)
            || !binding || binding.archived || binding.voiceTopicId!==topic.topicId || topic.chatId!==chatId
            || binding.profileIdentity!==intent.profileIdentity || binding.stateIdentityHash!==topic.stateIdentityHash)throw new Error("voice_handoff_context_changed");
          if(["failed","predecessor_confirmation_required","resume_confirmation_required"].includes(topic.operationalStatus))throw new Error("handoff_predecessor_unconfirmed");
          if(topic.activeTaskId || barrier.predecessors.some(id=>topic.queuedTaskIds.includes(id)))return false;
          for(const taskId of barrier.predecessors) {
            const status=history.taskStatus(chatId,taskId);
            if(status!=="completed")throw new Error("handoff_predecessor_unconfirmed");
          }
          if(!topic.sessionId || binding.nativeThreadId!==topic.sessionId || barrier.sessionScope!==neuralDeepSessionKey(this.chats.stateRoot,topic.sessionId))throw new Error("voice_handoff_session_changed");
          try {journal.handoffs.ready(barrier.id,barrier.requestHash);}
          catch(error) {
            // Voice publishes the final topic/history before its owned process
            // lease is released. Wait for that proven exit, not merely UI idle.
            if(error instanceof Error && ["handoff_predecessor_unconfirmed","admission_owner_conflict"].includes(error.message)
              && journal.snapshot().active.some(row=>barrier.predecessors.includes(row.workloadId)))return false;
            throw error;
          }
          if(!binding.continuationEnabled)history.mutate(chatId,current=>({...current,continuationEnabled:true,
            continuationEnabledAt:new Date().toISOString(),taskLinks:current.taskLinks.map(link=>({...link,mode:"shared_thread"}))}));
          return true;
        } finally {journal.close();}
      });
      if(ready)return;
      await delay(250,undefined,{signal,ref:false});
    }
  }

  cancel(intent:ExecutionIntent,turnId:string) {
    if(!intent.voiceHandoff)return;
    const journal=this.coordination();
    try {if(journal.handoffs.get(intent.voiceHandoff.id))journal.handoffs.cancel(intent.voiceHandoff.id,intent.voiceHandoff.requestHash,turnId);}
    finally {journal.close();}
  }
}
