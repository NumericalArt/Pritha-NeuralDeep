export type FilePreview={available:boolean;text:string;totalBytes:number|null;truncated:boolean;offset:number;error:string|null};
export function readPrivateFilePreview(file:string,options?:{root?:string;maxBytes?:number;tail?:boolean}):FilePreview;
export function readPrivateJsonlTail(file:string,root:string,maxBytes?:number):string[];
