import { randomUUID } from "node:crypto";
import { today } from "../../lib/date.mjs";

export function createMediaId({ date = today(), testId = process.env.PRITHA_PRIVACY_TEST_ID || "" } = {}) {
  const opaque = testId || randomUUID().replace(/-/g, "").slice(0, 16);
  return `${date}-media-${opaque}`;
}
