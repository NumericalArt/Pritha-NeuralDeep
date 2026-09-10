// Type-only bridge; host modules and private files never enter the client bundle.
export type { DeliveryBudgetChange, TaskDeliveryRequest, TaskDeliveryView } from "../../../../../scripts/agents-mother/task-delivery.mjs";
import type { TaskDeliveryRequest } from "../../../../../scripts/agents-mother/task-delivery.mjs";
export type DeliveryBudgetReceipt = { sourceTextHash?: string; request: TaskDeliveryRequest };
