import type {NeuralDeepChatHistoryStore} from './chat-history-store.mjs';
import type {ChatBinding} from '../../interfaces/control-center/src/lib/codex-chat/private-store';
import type {ThreadExecutionSummary,ThreadWorkspaceSummary} from '../../interfaces/control-center/src/lib/codex-chat/types';
export type SummaryBinding=ChatBinding&{execution?:ThreadExecutionSummary;workspace?:ThreadWorkspaceSummary};
export type SummaryChanges={cursor:string;revision:number;changed:string[];reset:boolean;more:boolean};
export class NeuralDeepChatSummaries {
 constructor(history:NeuralDeepChatHistoryStore);
 list(input?:{group?:string;archived?:boolean;search?:string;cursor?:string|null;limit?:number}):{data:SummaryBinding[];nextCursor:string|null};
 changes(cursor?:string|null):SummaryChanges;
 counts():Record<string,{working:number;attention:number}>;
}
