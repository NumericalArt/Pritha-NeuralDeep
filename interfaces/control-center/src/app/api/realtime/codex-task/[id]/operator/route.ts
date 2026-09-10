import { getPrithaVoiceOperatorTask } from "@/lib/realtime/pritha-runtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  const result=await getPrithaVoiceOperatorTask(id);
  return Response.json(result,{status:result.ok?200:404,headers:{"Cache-Control":"no-store"}});
}
