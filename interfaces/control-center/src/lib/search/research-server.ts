import { ResearchJobs } from "../../../../../scripts/search/research.mjs";
import { ensureResearchWorker } from "../../../../../scripts/search/research-manager.mjs";
import {
  resolvePrithaStateRoot,
  resolveTechscopeRoot,
} from "@/lib/pritha-paths";
import { searchService } from "./server";
import { recoverResearchHost } from "../../../../../scripts/search/research-host.mjs";
export const researchJobs = () => {
  const jobs = new ResearchJobs(searchService());
  recoverResearchHost(jobs);
  return jobs;
};
export const wakeResearch = () => {
  researchJobs();
  return ensureResearchWorker({
    stateRoot: resolvePrithaStateRoot(),
    codeRoot: resolveTechscopeRoot(),
    instance: process.env.PRITHA_INSTANCE_ID,
  });
};
export function publicJob(job: any) {
  const { messages, pending, ...checkpoint } = job.checkpoint;
  return {
    ...job,
    budget: searchService().store.counts({
      instance: process.env.PRITHA_INSTANCE_ID || "pritha",
      owner: job.owner,
      turn: job.id,
      surface: "research",
    }),
    worker: undefined,
    checkpoint: {
      ...checkpoint,
      sources: checkpoint.sources.map((s: any) => ({
        ...s,
        text: undefined,
        snippet: undefined,
      })),
    },
  };
}

export function operatorJob(id: string) {
  const jobs = researchJobs();
  jobs.reconcile();
  const row = searchService()
    .store.db.prepare("SELECT owner FROM jobs WHERE id=?")
    .get(id);
  if (!row) throw Object.assign(new Error("not_found"), { code: "not_found" });
  return jobs.get(id, row.owner);
}
export function operatorJobs() {
  researchJobs().reconcile();
  return searchService()
    .store.db.prepare("SELECT value FROM jobs ORDER BY updated DESC LIMIT 30")
    .all()
    .map((r: any) => JSON.parse(r.value));
}
