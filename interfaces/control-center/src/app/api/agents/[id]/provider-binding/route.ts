import { agentProviderErrorResponse, getAgentProviderBinding, setAgentProviderBinding } from '@/lib/control-center/agent-provider';

export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { return Response.json(await getAgentProviderBinding((await context.params).id)); }
  catch (error) { return agentProviderErrorResponse(error); }
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const reader = request.body?.getReader();
    if (!reader) return Response.json({ ok: false, error: { code: 'provider_binding_invalid' } }, { status: 400 });
    const parts: Uint8Array[] = []; let size = 0;
    try {
      for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length;
        if (size > 4096) { await reader.cancel(); return Response.json({ ok: false, error: { code: 'provider_binding_invalid' } }, { status: 413 }); }
        parts.push(value);
      }
    } finally { reader.releaseLock(); }
    const input = JSON.parse(Buffer.concat(parts).toString('utf8'));
    if (!input || Object.keys(input).some(key => !['mode','model','expectedRevision'].includes(key))) return Response.json({ ok: false, error: { code: 'provider_binding_invalid' } }, { status: 400 });
    return Response.json(await setAgentProviderBinding((await context.params).id, input));
  } catch (error) { return agentProviderErrorResponse(error); }
}
