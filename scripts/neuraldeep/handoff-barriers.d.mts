export type HandoffBarrier = {
  id: string; requestHash: string; owner: string; topicScope: string; sessionScope: string | null;
  state: "reserved" | "ready" | "finished" | "cancelled"; context: unknown; predecessors: string[];
};
export class NeuralDeepHandoffBarriers {
  get(id: string): HandoffBarrier | null;
  forScope(scope:string): HandoffBarrier | null;
  join(id:string,requestHash:string,owner:string,inputHash:string): string;
  reserve(input: { id: string; owner: string; topicScope: string; sessionScope?: string | null; predecessors: string[]; context: unknown }): HandoffBarrier;
  ready(id: string, requestHash: string): HandoffBarrier;
  cancel(id: string, requestHash: string, owner?: string): HandoffBarrier;
}
export function handoffRequestHash(input:{owner:string;topicScope:string;sessionScope?:string|null;predecessors:string[];context:unknown}):string;
