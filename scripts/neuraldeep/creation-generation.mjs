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
export function creationCanonicalFilename(job, source) {
  const name = path.basename(source);
  if (creationGeneration(job) === 1) return name;
  return `${name.replace(/(?:-revision-\d+)?\.md$/, '')}${creationGenerationSuffix(job)}.md`;
}
