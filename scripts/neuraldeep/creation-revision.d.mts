import type {CreationRequest} from './agent-creation.mjs';
export type CreationRevisionCheckpoint = 'intent_recorded'|'drafts_archived'|'verifier_cleared'|'seed_written'|'receipt_completed';
export function creationRevisionPending(job:any,options:{stateRoot:string}):null|{request:CreationRequest & {reason:string};generation:number;receiptPath:string};
export function reviseCreationProposal(job:any,request:CreationRequest & {reason?:string},options:{root:string;stateRoot:string;coordination:any;onRevisionCheckpoint?:(checkpoint:CreationRevisionCheckpoint)=>void}):any;
