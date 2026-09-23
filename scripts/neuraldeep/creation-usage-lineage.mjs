import path from 'node:path';
import { readBoundedRegularFile } from '../lib/safe-file-read.mjs';

/** Compatibility for old ledgers: only an exact host executor receipt proves a link. */
export function deliveryAccountingLineage(state, runRoot) {
  const accountedRunIds = [], unsettledRunIds = [], unboundAttempts = [];
  for (const [entries, destination] of [[state.budget.accounted_turns || [], accountedRunIds], [state.budget.unaccounted_attempts || [], unsettledRunIds]]) {
    for (const entry of entries) {
      let id = entry.launcher_run_id;
      if (!id || id !== entry.attempt_id) {
        try {
          if (!/^executor\/(?:attempt-nd_[a-f0-9-]+|iteration-\d+)\.json$/.test(entry.executor_result || '')) throw new Error('invalid_reference');
          const receipt = JSON.parse(readBoundedRegularFile(path.join(runRoot, entry.executor_result), { allowedRoots: [runRoot], maxBytes: 512 * 1024 }).text);
          if (receipt.provider !== 'neuraldeep' || receipt.run_id !== state.run_id || receipt.attempt_id !== receipt.launcher_run_id) throw new Error('invalid_binding');
          id = receipt.launcher_run_id;
        } catch { id = null; }
      }
      if (/^nd_[a-f0-9-]+$/.test(id || '')) destination.push(id);
      else if (destination === unsettledRunIds) unboundAttempts.push(entry.executor_result || 'missing-executor-receipt');
    }
  }
  return { deliveryRunId: state.run_id, accountedRunIds: [...new Set(accountedRunIds)],
    unsettledRunIds: [...new Set(unsettledRunIds)], unboundAttempts: [...new Set(unboundAttempts)] };
}
