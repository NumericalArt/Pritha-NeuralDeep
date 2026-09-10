import path from "node:path";

export function parseSource(input, options = {}) {
  const root = options.root || process.cwd();
  const value = String(input || "").trim();
  if (!value) throw new Error("Missing media source.");

  let parsedUrl = null;
  try {
    parsedUrl = new URL(value);
  } catch {
    parsedUrl = null;
  }

  if (parsedUrl && (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:")) {
    return {
      input: value,
      kind: "remote-url",
      isUrl: true,
      absolutePath: "",
      url: parsedUrl.toString(),
    };
  }

  return {
    input: value,
    kind: "local-file",
    isUrl: false,
    absolutePath: path.resolve(root, value),
    url: "",
  };
}
