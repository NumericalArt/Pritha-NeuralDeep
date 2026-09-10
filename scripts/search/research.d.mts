import type { SearchService, SearchContext } from "./service.mjs";
export class ResearchJobs {
  constructor(service: SearchService);
  create(
    input: { question: string; model: string; requestKey: string },
    context: SearchContext,
  ): any;
  get(id: string, owner: string): any;
  list(owner: string): any[];
  cancel(id: string, owner: string): any;
  resume(id: string, owner: string): any;
  reconcile(): void;
}
