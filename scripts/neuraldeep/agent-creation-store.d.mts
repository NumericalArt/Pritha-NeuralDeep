export class AgentCreationError extends Error {code:string;status:number;constructor(code:string,message?:string,status?:number)}
export class AgentCreationStore {
 readonly store:any;
 constructor(coordination:any);
 get(chatId:string):any;
 listRecoverable(limit?:number):Array<{job:any;startedActions:Array<{requestId:string;requestHash:string;request:any|null;recoverable:boolean}>}>;
 create(input:any):any;
 update(chatId:string,update:(current:any)=>any,expectedRevision?:number|null):any;
 beginAction(chatId:string,request:any):{replayed:boolean;status:string;result:any};
 finishAction(chatId:string,requestId:string,result:any):void;
 recordTurn(chatId:string,input:any):any;
 reconcileTurnUsage(chatId:string,receipt:{receiptId:string;source:'neuraldeep-runtime'|'delivery-ledger';chatId:string;turnId:string;tokens:number;processExited:true}):any;
}
export function creationBudgetBlocker(job:any):{code:string;message:string}|null;
export function creationPhase(job:any):string;
