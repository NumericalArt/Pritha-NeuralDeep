import { readJsonBody } from "./http";
/** Bounded raw Voice envelope, shared by host answer, approval, recovery and Stop. */
export async function voiceOperatorPost(request:Request,operation:(body:Record<string,unknown>)=>Promise<Record<string,unknown>>) {
  try {
    const body=await readJsonBody<unknown>(request);
    if(!body || typeof body!=="object" || Array.isArray(body))return Response.json({ok:false,error:"invalid_request"},{status:400});
    const result=await operation(body as Record<string,unknown>);
    return Response.json(result,{status:result.ok===false?409:200,headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    const status=error && typeof error==="object" && "status" in error && error.status===413?413:400;
    return Response.json({ok:false,error:status===413?"payload_too_large":"operator_request_unconfirmed"},{status});
  }
}
