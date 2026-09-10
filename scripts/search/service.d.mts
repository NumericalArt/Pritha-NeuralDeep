export type SearchContext = {
  instance?: string;
  owner: string;
  turn: string;
  surface: "task_chat" | "voice" | "child" | "research" | "diagnostic";
  explicit?: boolean;
  researchExplicit?: boolean;
  model?: string;
  signal?: AbortSignal;
};
export type Source = {
  id: string;
  url: string;
  title: string;
  snippet: string | null;
  text: string | null;
  published_at: string | null;
  retrieved_at: string;
  read: boolean;
  truncated: boolean;
  untrusted: true;
  provider: string;
};
export type SearchResult = {
  ok: boolean;
  id: string;
  status: string;
  provider: string | null;
  sources: Source[];
  results: Source[];
  elapsed_ms: number;
  retrieved_at: string;
  cached: boolean;
  warnings: string[];
  error: { code: string; retry_after?: number | null } | null;
  quota: unknown;
};
export type SearchSettings = {
  revision: number;
  enabled: boolean;
  provider: "neuraldeep" | "searxng";
  mode: "auto" | "requested" | "off";
  surfaces: {
    task_chat: boolean;
    voice: boolean;
    child: boolean;
    research: boolean;
  };
  fallback: boolean;
  searxngUrl: string;
  searchTimeoutMs: number;
  crawlTimeoutMs: number;
  searchCacheMs: number;
  pageCacheMs: number;
  taskSearch: number;
  taskRead: number;
  voiceSearch: number;
  voiceRead: number;
  childSearch: number;
  childRead: number;
  childAllowlist: string[];
};
export type SearchStatus = {
  settings: SearchSettings;
  health: string;
  diagnostic: any;
  quota: any;
  history: any[];
  capabilities: { search: boolean; read: boolean; research: boolean };
  credential: { source: string; status: string };
};
export class SearchService {
  constructor(options: {
    stateRoot: string;
    codeRoot: string;
    instance?: string;
    environment?: Record<string, string | undefined>;
    [key: string]: unknown;
  });
  store: any;
  search(input: unknown, context: SearchContext): Promise<SearchResult>;
  readPage(input: unknown, context: SearchContext): Promise<SearchResult>;
  getStatus(context: SearchContext): SearchStatus;
  configure(patch: Partial<SearchSettings>, revision: number): SearchSettings;
  diagnose(input: { kind: string }, context: SearchContext): Promise<any>;
}
