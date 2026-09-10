import { voiceOperatorPost } from "@/lib/codex-chat/voice-operator-http";
import { recoverPrithaCodexTask, type CodexTaskRecoveryAction } from "@/lib/realtime/pritha-runtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  return voiceOperatorPost(request,async body=>{
    const action=String(body.action || "") as CodexTaskRecoveryAction;
    if(!["retry","resume","cancel"].includes(action)) return {ok:false,error:"invalid_recovery_action"};
    return recoverPrithaCodexTask(id,action,body);
  });
}
