import { createHash } from "node:crypto";

export function markdownBodyText(value) {
  const text = String(value || "").replace(/\r\n?/g, "\n");
  if (!text.startsWith("---\n")) return text;
  const end = text.indexOf("\n---\n", 4);
  return end === -1 ? text : text.slice(end + 5);
}



export function markdownDocumentLock(value, field = "research_content_lock") {
  const text = String(value || "").replace(/\r\n?/g, "\n");
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const placeholder = `${field}: [CONTENT_LOCK]`;
  let canonical = text;
  if (canonical.startsWith("---\n")) {
    const end = canonical.indexOf("\n---\n", 4);
    if (end !== -1) {
      const frontmatter = canonical.slice(4, end);
      const body = canonical.slice(end + 5);
      const pattern = new RegExp(`^${escaped}:.*$`, "gm");
      const lockedFrontmatter = pattern.test(frontmatter)
        ? frontmatter.replace(pattern, placeholder)
        : `${frontmatter}\n${placeholder}`;
      canonical = `---\n${lockedFrontmatter}\n---\n${body}`;
    }
  }
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

export function contentSha256(value) {
  const normalized = String(value || "").replace(/\r\n?/g, "\n").trim();
  return `sha256:${createHash("sha256").update(normalized).digest("hex")}`;
}
