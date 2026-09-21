import { createHash } from 'node:crypto';
import path from 'node:path';

/** Private paths stay out of redacted reports; their exact host binding does not. */
export function scaffoldReportBinding({ root, stateRoot, projectRoot, contractPath, fingerprint, outcome, revision }) {
  return createHash('sha256').update(JSON.stringify({
    version: 2, root: path.resolve(root), stateRoot: path.resolve(stateRoot || root),
    projectRoot: path.resolve(projectRoot), contractPath: path.resolve(contractPath), fingerprint,
    outcomeId: outcome?.id, semanticLock: outcome?.semanticLock, documentLock: outcome?.documentLock,
    revision,
  })).digest('hex');
}
