import type { SearchService, SearchContext } from "./service.mjs";
export function callSearchTool(
  service: SearchService,
  name: string,
  args: Record<string, unknown>,
  context: SearchContext,
): Promise<any>;
