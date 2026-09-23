/** Classification authorizes execution only when the backend enforces no network. */
export function trialModelUse(plan, backend) {
  const automated=(plan.trials || []).filter(trial=>trial.kind==='automated');
  if (!automated.length) return {kind:'none',reason:'operator-evidence-only'};
  if (plan.execution_policy?.trial_model_usage==='metered') return {kind:'metered',reason:'approved-model-using-trials'};
  if (automated.every(trial=>trial.isolation==='sandbox') && ['codex-cli','codex-cli-sandbox'].includes(backend)) {
    return {kind:'none',reason:'sandbox-network-disabled'};
  }
  return {kind:'unknown',reason:'command-internal-inference-not-proven-absent'};
}

export function deliveryProcessesExited(budget) {
  if (budget.legacy_usage_unverified) return false;
  return (budget.unaccounted_attempts || []).every(entry=>entry.process_exited===true
    && (!/^executor\/attempt-nd_/.test(entry.executor_result || '')
      || entry.process_protocol===1 && entry.process_tree_exited===true && entry.adapter_closed===true));
}
