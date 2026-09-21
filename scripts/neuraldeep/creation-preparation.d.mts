export function readCreationBrief(answer:string,job:any):{brief?:any;hash?:string;issues:string[]};
export function prepareCreationContract(job:any,brief:any,options:any):{contract:any;brief:any;briefHash:string};
export function prepareCreationOutcome(job:any,options:any):{outcome:any};
export function creationBriefPrompt(job:any):string;
export function completeCreationBrief(job:any,answer:string,options:any):any;
