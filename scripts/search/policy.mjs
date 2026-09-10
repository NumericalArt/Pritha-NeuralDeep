import ipaddr from "ipaddr.js";
import { lookup } from "node:dns/promises";
import { fail } from "./contracts.mjs";
export function publicAddress(address) {
  try {
    let ip = ipaddr.parse(address.replace(/^\[|\]$/g, ""));
    if (ip.kind() === "ipv6" && ip.isIPv4MappedAddress())
      ip = ip.toIPv4Address();
    return ip.range() === "unicast";
  } catch {
    return false;
  }
}
export function publicUrl(value) {
  let u;
  try {
    u = new URL(value);
  } catch {
    fail("url_blocked");
  }
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    value.length > 4096 ||
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    (u.port && u.port !== "443") ||
    (!host.includes(".") && !host.includes(":")) ||
    /(^|\.)(localhost|local|internal|test|invalid|onion)$/.test(host)
  )
    fail("url_blocked");
  if (ipaddr.isValid(host) && !publicAddress(host)) fail("url_blocked");
  for (const key of u.searchParams.keys())
    if (
      /^(?:token|access_token|api_key|key|signature|sig|auth|authorization|x-amz-.+|x-goog-.+)$/i.test(
        key,
      )
    )
      fail("url_blocked");
  u.hash = "";
  return u.toString();
}
export async function verifyPublicUrl(value, resolve = lookup) {
  const url = publicUrl(value);
  let rows;
  try {
    rows = await resolve(new URL(url).hostname.replace(/^\[|\]$/g, ""), {
      all: true,
    });
  } catch {
    fail("url_blocked");
  }
  if (!rows.length || rows.some((r) => !publicAddress(r.address)))
    fail("url_blocked");
  return url;
}
export function searxngUrl(value) {
  let u;
  try {
    u = new URL(value);
  } catch {
    fail("url_blocked");
  }
  if (u.username || u.password || u.hash) fail("url_blocked");
  if (
    u.protocol === "http:" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname)
  )
    return u.toString();
  return publicUrl(value);
}
export function safeDate(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    return null;
  return value.slice(0, 40);
}
