import { searchService } from "./server";
import type { SearchContext } from "../../../../../scripts/search/service.mjs";
export async function voiceSearch(
  name: string,
  args: Record<string, unknown>,
  context?: SearchContext,
) {
  if (!context)
    return {
      ok: false,
      status: "failed",
      error: { code: "voice_search_context_required" },
    };
  const service = searchService();
  if (name.startsWith("research_")) {
    const { callSearchTool } = await import(
      "../../../../../scripts/search/tools.mjs"
    );
    return callSearchTool(service, name, args, context);
  }
  if (name === "read_page") return service.readPage(args, context);
  if (args.mode === "deep")
    return {
      ok: false,
      status: "failed",
      error: { code: "use_research_start" },
      warnings: [
        "Use a separate explicit research job; web_search does not perform deep research.",
      ],
    };
  if (args.operation === "diagnose")
    return service.search(
      { query: "NeuralDeep Search API documentation", max_results: 3 },
      context,
    );
  const { operation: _, mode: __, source_policy: ___, ...input } = args;
  return service.search(input, context);
}
