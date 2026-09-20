export type CreationRuntimeReceipt={receiptId:string|null;tokens:number|null;processExited:boolean;coverage:'complete'|'unknown';runs:Array<{runId:string;tokens:number|null;processExited:boolean}>;blocker?:{code:string;message:string}};
export function creationRuntimeReceipt(coordination:any,turnId:string,options?:{dispatched?:boolean}):CreationRuntimeReceipt;
export function creationObservedUsage(coordination:any,job:any):{knownMinimumTokens:number;unfinalizedTokens:number;unknownRequests:number};
