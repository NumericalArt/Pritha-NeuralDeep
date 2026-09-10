import { createHash } from "node:crypto";

export function hashText(value, length = 12) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, length);
}
