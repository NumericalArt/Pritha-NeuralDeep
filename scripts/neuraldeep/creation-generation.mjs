import path from 'node:path';
import { AgentCreationError } from './agent-creation-store.mjs';

export function creationGeneration(job) {
  const generation = job.generation === undefined ? 1 : job.generation;
  if (!Number.isSafeInteger(generation) || generation < 1 || generation > 100) throw new AgentCreationError('creation_generation_invalid');
  return generation;
}
export function creationGenerationSuffix(job) {
  const generation = creationGeneration(job);
  return generation === 1 ? '' : `-revision-${generation}`;
}
export function creationDocumentIdentity(job) {
  if (!/^creation_[a-f0-9]{24}$/.test(job.jobId) || !/^[a-z0-9][a-z0-9-]{0,95}$/.test(job.agentId)) throw new AgentCreationError('creation_document_identity_invalid');
  const stem = `${job.agentId}-${job.jobId}`;
  return {version:2,generation:creationGeneration(job),
    contract:`${stem}-agent-contract${creationGenerationSuffix(job)}.md`,
    outcome:`${stem}-agent-outcome-spec${creationGenerationSuffix(job)}.md`};
}
export function creationCanonicalFilename(job, source, kind) {
  if (job.documentIdentity) {
    const expected=creationDocumentIdentity(job);
    if (JSON.stringify(job.documentIdentity)!==JSON.stringify(expected) || !['contract','outcome'].includes(kind)) throw new AgentCreationError('creation_document_identity_invalid');
    return expected[kind];
  }
  const name = path.basename(source);
  if (creationGeneration(job) === 1) return name;
  return `${name.replace(/(?:-revision-\d+)?\.md$/, '')}${creationGenerationSuffix(job)}.md`;
}
