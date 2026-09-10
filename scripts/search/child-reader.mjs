import https from "node:https";
import { lookup } from "node:dns/promises";
import { publicUrl, publicAddress } from "./policy.mjs";
import { fail } from "./contracts.mjs";
/** Child-only reader preserves exact host allowlists and pins validated DNS on every redirect. */
export async function readChildPage(value, hosts, signal, depth = 0) {
  const url = publicUrl(value),
    u = new URL(url);
  if (
    !Array.isArray(hosts) ||
    !hosts.some((h) => u.hostname === h || u.hostname === `www.${h}`)
  )
    fail("url_blocked");
  const addresses = await lookup(u.hostname, { all: true });
  signal.throwIfAborted();
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    fail("url_blocked");
  const chosen = addresses.find((a) => a.family === 4) || addresses[0];
  const r = await new Promise((resolve, reject) => {
    const request = https.get(
      u,
      {
        signal,
        headers: {
          Accept: "text/html,text/plain,application/xhtml+xml",
          "User-Agent": "PrithaSearch/1.0",
        },
        lookup: (_h, o, cb) =>
          o.all ? cb(null, [chosen]) : cb(null, chosen.address, chosen.family),
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          res.resume();
          try {
            resolve({ redirect: new URL(res.headers.location, u).href });
          } catch {
            reject(Error("invalid_response"));
          }
          return;
        }
        if (
          res.statusCode !== 200 ||
          !/^(?:text\/|application\/xhtml)/i.test(
            res.headers["content-type"] || "",
          )
        ) {
          res.resume();
          reject(Error("provider_unavailable"));
          return;
        }
        let size = 0;
        const parts = [];
        res.on("data", (b) => {
          size += b.length;
          if (size > 1000000) res.destroy(Error("invalid_response"));
          else parts.push(b);
        });
        res.once("error", reject);
        res.once("end", () =>
          resolve({ text: Buffer.concat(parts).toString("utf8") }),
        );
      },
    );
    request.once("error", reject);
  });
  if (r.redirect) {
    if (depth >= 3) fail("url_blocked");
    return readChildPage(r.redirect, hosts, signal, depth + 1);
  }
  const text = r.text
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return {
    items: [{ url, content: text, title: "" }],
    warnings: ["child_allowlist_pinned_reader"],
  };
}
