import { agentProviderCompletion, agentProviderErrorResponse } from '@/lib/control-center/agent-provider';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { return await agentProviderCompletion(request, (await context.params).id); }
  catch (error) { return agentProviderErrorResponse(error); }
}
