// The card identity is a projection of the instance catalog, never a new lookup
// by a display name. Mission is already refreshed from its authored source.
export function projectAgentCardIdentity(record, mission) {
  return { id: record.id, agentKind: record.agentKind,
    identity: { agentId: record.agentId, instanceKey: record.instanceKey, status: record.identityStatus,
      diagnostics: record.diagnostics, routeAliases: record.routeAliases },
    name: record.name, mission };
}
