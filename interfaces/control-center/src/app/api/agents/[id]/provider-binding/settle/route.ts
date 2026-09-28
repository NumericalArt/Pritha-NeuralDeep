import { agentProviderErrorResponse, settleAgentProviderUsage } from '@/lib/control-center/agent-provider';

export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const text = await request.text();
    if (text.length > 1024) return Response.json({ ok: false, error: { code: 'provider_binding_invalid' } }, { status: 413 });
    const input = JSON.parse(text);
    if (!input || Object.keys(input).some(key => !['requestId','expectedRevision'].includes(key))) return Response.json({ ok: false, error: { code: 'provider_binding_invalid' } }, { status: 400 });
    return Response.json(await settleAgentProviderUsage((await context.params).id, input));
  } catch (error) { return agentProviderErrorResponse(error); }
}
