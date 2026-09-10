import { voiceOperatorPost } from "@/lib/codex-chat/voice-operator-http";
import { decidePrithaCodexTask, type CodexTaskApprovalAction } from "@/lib/realtime/pritha-runtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  return voiceOperatorPost(request,async body=>{
    const action=String(body.action || "") as CodexTaskApprovalAction;
    if(!["approve","reject"].includes(action)) return {ok:false,error:"invalid_approval_action"};
    return decidePrithaCodexTask(id,action,body);
  });
}
