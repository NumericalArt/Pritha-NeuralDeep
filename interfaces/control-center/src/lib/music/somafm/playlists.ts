export function parsePls(content: string): string[] {
  const urls: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const match = line.trim().match(/^File\d+=(.+)$/i);
    const value = match?.[1]?.trim();
    if (value && /^https?:\/\//i.test(value)) urls.push(value);
  }
  return urls.sort((first, second) => {
    const firstHttps = first.toLowerCase().startsWith("https://");
    const secondHttps = second.toLowerCase().startsWith("https://");
    return Number(secondHttps) - Number(firstHttps);
  });
}

export function parseM3u(content: string): string[] {
  const urls: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const value = line.trim();
    if (!value || value.startsWith("#")) continue;
    if (/^https?:\/\//i.test(value)) urls.push(value);
  }
  return urls.sort((first, second) => {
    const firstHttps = first.toLowerCase().startsWith("https://");
    const secondHttps = second.toLowerCase().startsWith("https://");
    return Number(secondHttps) - Number(firstHttps);
  });
}

export function parsePlaylistByUrl(url: string, content: string): string[] {
  const lower = url.toLowerCase();
  if (lower.endsWith(".pls")) return parsePls(content);
  if (lower.endsWith(".m3u") || lower.endsWith(".m3u8")) return parseM3u(content);
  const pls = parsePls(content);
  return pls.length ? pls : parseM3u(content);
}
