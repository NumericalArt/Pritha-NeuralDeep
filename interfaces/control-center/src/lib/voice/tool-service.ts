import Ajv from 'ajv';
import {
  buildPrithaRealtimeTools,
  handlePrithaRealtimeTool,
} from '@/lib/realtime/pritha-runtime';
import { getNeuralDeepAdmissionCoordinator } from '@/lib/codex-chat/admission-coordinator';
export type VoiceOperationIdentity = {
  id: string;
  sessionId: string;
  turnId: string;
  signal?: AbortSignal;
  explicitSearch?: boolean;
  researchExplicit?: boolean;
  model?: string;
};
const ajv = new Ajv({
  strict: false,
  allErrors: false,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
});
const validators = new Map<string, ReturnType<typeof ajv.compile>>();
export function validateVoiceTool(
  name: string,
  args: unknown,
  musicControlEnabled = false,
) {
  const tool = buildPrithaRealtimeTools({ musicControlEnabled }).find(
    (t) => t.name === name,
  );
  if (!tool || !args || typeof args !== 'object' || Array.isArray(args))
    throw new Error('voice_tool_invalid');
  let validate = validators.get(name);
  if (!validate) {
    validate = ajv.compile({ ...tool.parameters, additionalProperties: false });
    validators.set(name, validate);
  }
  if (!validate(args)) throw new Error('voice_tool_arguments_invalid');
  return args as Record<string, unknown>;
}
/** Host-owned identity, never a field in the model's tool schema. */
export async function executeVoiceTool(
  name: string,
  args: Record<string, unknown>,
  identity?: VoiceOperationIdentity,
) {
  validateVoiceTool(name, args);
  const mutating =
    [
      'run_codex_task',
      'answer_codex_task',
      'record_good_state_signal',
    ].includes(name) ||
    (name === 'full_pritha_memory' &&
      [
        'reindex',
        'rebuild_embeddings',
        'rebuild_embeddings_async',
        'write_note',
        'append_artifact',
      ].includes(String(args.operation)));
  if (!identity || !mutating)
    return (await handlePrithaRealtimeTool(name, args, {searchContext:identity ? {owner:identity.sessionId,turn:identity.turnId,surface:"voice",signal:identity.signal,explicit:identity.explicitSearch===true,researchExplicit:identity.researchExplicit===true,model:identity.model}:undefined})) as Record<
      string,
      unknown
    >;
  const journal = getNeuralDeepAdmissionCoordinator().voiceJournal();
  const receipt = journal.reserveOperation({ ...identity, name, args });
  if (!receipt.dispatch)
    return (
      receipt.result || {
        ok: false,
        error: 'voice_operation_recovery_required',
        task_id: receipt.task_id,
        operation_id: identity.id,
      }
    );
  let output: Record<string, unknown>;
  try {
    output = (await handlePrithaRealtimeTool(name, args, {
      reservedTaskId: receipt.task_id || undefined,
    })) as Record<string, unknown>;
  } catch {
    output = {
      ok: false,
      error: 'voice_tool_failed',
      task_id: receipt.task_id,
    };
  }
  journal.finishOperation(identity.id, output);
  return output;
}
