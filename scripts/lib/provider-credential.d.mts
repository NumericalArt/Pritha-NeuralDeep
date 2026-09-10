export function readProviderCredential(service?: string, environment?: NodeJS.ProcessEnv): string;
export function providerCredentialStatus(service?: string): {configured:boolean;status:string;source:string;storageTarget:string;maskedValue:string;browserExposure:string;purpose:string};
export function storeProviderCredential(value:string, options?:{service?:string;account?:string}): Promise<ReturnType<typeof providerCredentialStatus>>;
