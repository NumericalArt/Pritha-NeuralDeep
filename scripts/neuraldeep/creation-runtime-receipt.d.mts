export type CreationRuntimeReceipt={receiptId:string|null;tokens:number|null;processExited:boolean;coverage:'complete'|'unknown';runs:Array<{runId:string;tokens:number|null;processExited:boolean}>};
export function creationRuntimeReceipt(coordination:any,turnId:string,options?:{dispatched?:boolean}):CreationRuntimeReceipt;
