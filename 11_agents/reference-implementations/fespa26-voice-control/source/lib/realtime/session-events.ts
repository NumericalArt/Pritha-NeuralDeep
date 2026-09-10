export type RealtimeSessionUpdateEvent = {
  type: "session.update"
  event_id: string
  session: {
    type: "realtime"
    instructions: string
  }
}

export function buildRealtimeSessionUpdateEvent(
  instructions: string,
  eventId = `evt_fast_talk_${Date.now().toString(36)}`,
): RealtimeSessionUpdateEvent {
  return {
    type: "session.update",
    event_id: eventId,
    session: {
      type: "realtime",
      instructions,
    },
  }
}
