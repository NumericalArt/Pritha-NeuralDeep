export function markdownLink(value: string): { href: string | null; local: boolean } {
  const target = value.replace(/^<|>$/g, "");
  if (/^#/.test(target) || /^\/(?:agents|codex|task-chat|voice|settings)(?:[?#]|$)/.test(target)) return { href: target, local: false };
  if (/^(?:\/|\.{1,2}\/|~\/|file:|[A-Za-z]:[\\/])/.test(target)) return { href: null, local: true };
  try {
    const url = new URL(target);
    return { href: ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? target : null, local: false };
  } catch { return { href: null, local: false }; }
}
