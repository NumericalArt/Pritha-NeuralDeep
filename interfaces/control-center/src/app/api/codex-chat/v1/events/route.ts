import {apiError} from '@/lib/codex-chat/http';
import {getCodexChatGateway} from '@/lib/codex-chat/gateway';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request:Request){
  try{
    const gateway=getCodexChatGateway(),url=new URL(request.url);
    const initial=await gateway.summaryChanges(request.headers.get('last-event-id')||url.searchParams.get('cursor'));
    const encoder=new TextEncoder();let close=(_end=true)=>{};
    const stream=new ReadableStream<Uint8Array>({
      start(controller){
        let closed=false,cursor=initial.cursor,timer:ReturnType<typeof setTimeout>|null=null,lastHeartbeat=Date.now();
        const abort=()=>close();
        close=(end=true)=>{if(closed)return;closed=true;if(timer)clearTimeout(timer);request.signal.removeEventListener('abort',abort);if(end)controller.close();};
        const send=(value:typeof initial)=>{if(!closed)controller.enqueue(encoder.encode(`id: ${value.cursor}\nevent: summary.changed\ndata: ${JSON.stringify(value)}\n\n`));};
        const poll=async()=>{
          if(closed)return;
          try{
            const value=await gateway.summaryChanges(cursor);cursor=value.cursor;
            if(value.reset||value.changed.length)send(value);
            else if(Date.now()-lastHeartbeat>15000&&!closed){controller.enqueue(encoder.encode(': heartbeat\n\n'));lastHeartbeat=Date.now();}
            if(!closed)timer=setTimeout(poll,value.more?50:1000);
          }catch{if(!closed)controller.enqueue(encoder.encode('event: summary.unavailable\ndata: {"code":"summary_temporarily_unavailable"}\n\n'));close();}
        };
        if(request.signal.aborted){close();return;}
        request.signal.addEventListener('abort',abort,{once:true});send(initial);timer=setTimeout(poll,initial.more?50:1000);
      },cancel(){close(false);},
    });
    return new Response(stream,{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'}});
  }catch(error){return apiError(error);}
}
