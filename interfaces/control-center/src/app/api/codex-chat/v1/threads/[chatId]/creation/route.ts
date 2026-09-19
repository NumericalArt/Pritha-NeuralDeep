import { apiError, apiSuccess, readJsonBody, requireIdempotencyKey } from '@/lib/codex-chat/http';
import { CodexChatGatewayError, getCodexChatGateway, AgentCreationError } from '@/lib/codex-chat/gateway';
import type { CreationRequest } from '@/lib/codex-chat/creation-types';

export const runtime='nodejs';
export const dynamic='force-dynamic';
function creationError(error:unknown) {
  return apiError(error instanceof AgentCreationError ? new CodexChatGatewayError(error.code,error.message,error.status) : error);
}
export async function GET(_request:Request,{params}:{params:Promise<{chatId:string}>}) {
  try {return apiSuccess(await getCodexChatGateway().creationStatus((await params).chatId));}
  catch(error){return creationError(error);}
}
export async function POST(request:Request,{params}:{params:Promise<{chatId:string}>}) {
  try {
    const origin=request.headers.get('origin'),host=request.headers.get('x-forwarded-host') || request.headers.get('host');
    if(!origin || new URL(origin).host!==host)throw new CodexChatGatewayError('creation_origin_invalid','Подтвердите действие в этом Control Center.',403);
    const key=requireIdempotencyKey(request),body=await readJsonBody<CreationRequest>(request);
    if(key!==body.requestId)throw new CodexChatGatewayError('idempotency_conflict','Идентификаторы запроса не совпадают.',409);
    return apiSuccess(await getCodexChatGateway().creationAction((await params).chatId,body));
  } catch(error){return creationError(error);}
}
