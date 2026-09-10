import { createHash } from "node:crypto";

// Text coercion and tagged digest used by authored Outcome and delivery locks.
export function sha256Text(value) {
  return `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;
}
