import { SearchService } from "./service.mjs";
import { ResearchJobs, runResearchJob } from "./research.mjs";
import {
  researchModelCall,
  reconcileResearchUsage,
} from "./research-provider.mjs";
const stateRoot = process.env.PRITHA_STATE_ROOT,
  codeRoot = process.env.TECHSCOPE_ROOT;
if (!stateRoot || !codeRoot) throw new Error("research_context_missing");
const service = new SearchService({
  stateRoot,
  codeRoot,
  instance: process.env.PRITHA_INSTANCE_ID,
});
const jobs = new ResearchJobs(service);
const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => controller.abort());
try {
  jobs.reconcile();
  reconcileResearchUsage(service.store);
  let job;
  while (!controller.signal.aborted && (job = jobs.claim())) {
    await runResearchJob(jobs, job, {
      signal: controller.signal,
      modelCall: researchModelCall({
        stateRoot,
        codeRoot,
        store: service.store,
        job,
      }),
    });
  }
} finally {
  service.store.close();
}
