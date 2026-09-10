import { voiceOperatorPost } from "@/lib/codex-chat/voice-operator-http";
import { abortPrithaCodexTask } from "@/lib/realtime/pritha-runtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  return voiceOperatorPost(request,async body=>{
    return abortPrithaCodexTask(id,body.reason,body.expected_attempt_id);
  });
}
