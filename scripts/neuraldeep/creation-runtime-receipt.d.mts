export type CreationRuntimeReceipt={receiptId:string|null;tokens:number|null;processExited:boolean;coverage:'complete'|'unknown';runs:Array<{runId:string;tokens:number|null;processExited:boolean}>;blocker?:{code:string;message:string}};
export function creationRuntimeReceipt(coordination:any,turnId:string,options?:{dispatched?:boolean}):CreationRuntimeReceipt;
export type CreationObservedUsage={finalizedTokens:number;knownMinimumTokens:number;unfinalizedTokens:number;unknownRequests:number;pendingRequests:number;reservedTokens:number;unboundAttempts:number;coverage:'partial'|'complete';provenance:Array<{runId:string;measuredTokens:number;unresolvedRequests:number;processExited:boolean}>};
export function creationObservedUsage(coordination:any,job:any):CreationObservedUsage;
