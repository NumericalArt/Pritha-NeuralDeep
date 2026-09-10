import type { CatalogAgent } from './identity.mjs';
export function projectAgentCardIdentity(record: CatalogAgent & { routeAliases: string[] }, mission: string): {
  id: string; agentKind: CatalogAgent['agentKind']; name: string; mission: string;
  identity: { agentId: CatalogAgent['agentId']; instanceKey: string; status: CatalogAgent['identityStatus']; diagnostics: string[]; routeAliases: string[] };
};
