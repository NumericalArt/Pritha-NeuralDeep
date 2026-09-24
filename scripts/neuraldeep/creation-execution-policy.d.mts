export type CreationExecutionPolicy={schema:'pritha-creation-execution-policy-v1'|'pritha-creation-execution-policy-v2';version:1|2;modelId:string;effortId:string|null;effectiveEffortId:string|null;modelProfile:ReturnType<typeof import("./model-execution-profile.mjs").neuralDeepExecutionProfile>;promptBudgetApplicability:string;iterationTimeoutMs:number;requestTimeoutMs:number;settlementGraceMs:number;configuredPromptTokenBudget:number;appliesTo:string};
export type ExecutionDeadline={version:1|2;hardDeadlineAt:number;softDeadlineAt:number;requestTimeoutMs:number;settlementGraceMs:number};
export function creationExecutionPolicy(input:{modelId:string;effortId?:string|null;timeoutMs?:number;promptTokenBudget?:number}):CreationExecutionPolicy;
export function preparationExecutionDeadline(job:{executionPolicy?:CreationExecutionPolicy;budget:{maxActiveMs:number;activeMs:number}},now?:number):ExecutionDeadline|null;
export function executionDeadline(input:{hardDeadlineAt:number;requestTimeoutMs?:number;settlementGraceMs?:number},now?:number):ExecutionDeadline;
export function requestDeadlineWindow(deadline?:ExecutionDeadline|null,now?:number):number|null;
