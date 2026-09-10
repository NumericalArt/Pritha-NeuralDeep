import os from "node:os";
import { isIP } from "node:net";

const SENSITIVE_KEY_TOKENS = new Set([
  "auth", "authorization", "code", "credential", "credentials", "key", "pass", "passwd",
  "passphrase", "password", "secret", "session", "sig", "signature", "token",
]);
const SENSITIVE_COMPOUND_KEYS = new Set([
  "accesskey", "accesssecret", "accesstoken", "apikey", "authkey", "authtoken", "bottoken",
  "clientsecret", "connectionstring", "databaseurl", "dbpass", "dsn", "privatekey",
  "proxyauthorization", "redisurl", "secretaccesskey", "servicerolekey", "sessionid",
  "signingkey",
]);
const SENSITIVE_ASSIGNMENT_KEY = "(?:CT0|AUTHORIZATION|PROXY[-_]?AUTHORIZATION|COOKIE|SET[-_]?COOKIE|DATABASE[-_]?URL|REDIS[-_]?URL|[A-Za-z][A-Za-z0-9_.-]*(?:DSN|CONNECTION[-_]?STRING)|(?:[A-Za-z][A-Za-z0-9_.-]*[-_.])?(?:API[-_]?KEY|AUTH[-_]?KEY|ACCESS[-_]?TOKEN|AUTH[-_]?TOKEN|BOT[-_]?TOKEN|PRIVATE[-_]?KEY|SERVICE[-_]?ROLE[-_]?KEY|SIGNING[-_]?KEY|ENCRYPTION[-_]?KEY|SECRET[-_]?ACCESS[-_]?KEY|CREDENTIAL|PASSWORD|SECRET|TOKEN|KEY))";
const SENSITIVE_ASSIGNMENT_PATTERN = new RegExp(
  `(^|[\\s{[(,;:])(["']?)(${SENSITIVE_ASSIGNMENT_KEY})\\2\\s*([:=])\\s*(?!\\[REDACTED(?:_[A-Z]+)?\\])(?:(["'])((?:\\\\.|(?!\\5)[^\\\\]){0,10000})\\5|([^,\\s)\\]}]+))`,
  "gim",
);
const URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"'`]+/gi;
const SCHEME_RELATIVE_URL_PATTERN = /\/\/(?:\[[0-9a-f:.]+\]|[A-Za-z0-9.-]+)(?::\d{1,5})?(?:[/?#][^\s<>"'`]*)?/gi;
const MAX_DECODE_ROUNDS = 4;
const MAX_DECODE_INPUT_CHARS = 20_000;
const MAX_SECURITY_SCAN_CHARS = 1_000_000;
const SECURITY_SCAN_OVERLAP_CHARS = 512;

export function isSensitiveUrlKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  const tokens = raw
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .map((token) => token.toLowerCase())
    .filter(Boolean);
  if (tokens.some((token) => SENSITIVE_KEY_TOKENS.has(token))) return true;
  const compact = raw.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return SENSITIVE_COMPOUND_KEYS.has(compact);
}

function normalizedInstructionText(value) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 20_000)
    .toLowerCase();
}

function isHighRiskInstructionText(text) {
  return /\b(?:ignore|disregard|forget|override)\b.{0,50}\b(?:previous|prior|above|system|developer)\b.{0,40}\b(?:instruction|message|prompt|rule)s?\b/.test(text)
    || /\b(?:read|retrieve|fetch|open|cat|print|expose|reveal|dump|upload|send|transmit|forward|post|exfiltrat(?:e|ion)|leak)\b.{0,160}(?:\.env\b|~\/|\bcredential|\bsecret|\btoken|private[- ]key|system[- ]prompt)/.test(text)
    || /\b(?:execute|run|invoke)\b.{0,60}\b(?:shell|terminal|command|tool|script|curl|wget)\b/.test(text)
    || /\bcall\b.{0,60}\b(?:shell|terminal|command|curl|wget)\b/.test(text)
    || /\b(?:upload|send|transmit|forward|post|exfiltrat(?:e|ion)|leak)\b.{0,160}(?:https?:\/\/|webhook|attacker|externally)/.test(text)
    || /\b(?:system|developer)\s+(?:message|prompt)\b.{0,80}\b(?:obsolete|invalid|superseded|untrusted|ignore|override)\b/.test(text)
    || /(?:^|[\s.!?])(?:игнорируй|игнорировать|забудь|забудьте|переопредели|отмени)(?:$|[\s,.:;!?]).{0,80}(?:предыдущ|системн|инструкц|правил|промпт|сообщен)/u.test(text)
    || /(?:^|[\s.!?])(?:прочитай|прочитать|получи|получить|извлеки|извлечь|открой|открыть|покажи|раскрой|выведи|отправь|отправить|передай|передать|загрузи|укради)(?:$|[\s,.:;!?]).{0,180}(?:\.env\b|~\/|секрет|токен|парол|уч[её]тн|приватн.{0,20}ключ)/u.test(text);
}

export function containsHighRiskInstruction(value) {
  const source = String(value || "");
  if (source.length > MAX_SECURITY_SCAN_CHARS) return true;
  return securityScanWindows(source).some((window) => (
    isExcessivelyEncoded(window)
    || securityDecodedVariants(window).some((variant) => isHighRiskInstructionText(normalizedInstructionText(variant)))
  ));
}

export function quarantineUntrustedInstructionText(value) {
  return containsHighRiskInstruction(value)
    ? "[QUARANTINED_UNTRUSTED_INSTRUCTION]"
    : redactSensitiveText(value);
}

function isPrivateIpv4(hostname) {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [first, second] = parts;
  return first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || first >= 224;
}

function isPrivateIpv6(hostname) {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (normalized === "::" || normalized === "::1") return true;
  if (/^(?:fc|fd)[0-9a-f]{2}:/.test(normalized)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true;
  if (/^ff[0-9a-f]{2}:/.test(normalized)) return true;
  const mappedIpv4 = normalized.match(/^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mappedIpv4) return isPrivateIpv4(mappedIpv4[1]);
  const mappedHex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const high = Number.parseInt(mappedHex[1], 16);
    const low = Number.parseInt(mappedHex[2], 16);
    const ipv4 = `${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`;
    return isPrivateIpv4(ipv4);
  }
  return false;
}

export function isPrivateNetworkHostname(value) {
  const hostname = String(value || "").trim().replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!hostname) return true;
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;
  if (hostname.endsWith(".local") || hostname.endsWith(".internal") || hostname.endsWith(".lan") || hostname.endsWith(".home.arpa")) return true;
  if (hostname === "ts.net" || hostname.endsWith(".ts.net")) return true;
  if (!hostname.includes(".") && isIP(hostname) === 0) return true;
  const ipVersion = isIP(hostname);
  if (ipVersion === 4) return isPrivateIpv4(hostname);
  if (ipVersion === 6) return isPrivateIpv6(hostname);
  return false;
}

function splitTrailingUrlPunctuation(value) {
  const source = String(value);
  const preserveIpv6Bracket = /^\w[\w+.-]*:\/\/\[[^\]]+\]$/.test(source);
  const match = source.match(preserveIpv6Bracket ? /^(.*?)([),.;}]*)$/ : /^(.*?)([),.;}\]]*)$/);
  return { candidate: match?.[1] || String(value), suffix: match?.[2] || "" };
}

function decodePercentBytesTolerantly(value) {
  return String(value || "").replace(/(?:%[0-9A-Fa-f]{2})+/g, (run) => {
    const bytes = run.match(/[0-9A-Fa-f]{2}/g) || [];
    return Buffer.from(bytes.map((hex) => Number.parseInt(hex, 16))).toString("utf8");
  });
}

function decodedVariants(value) {
  const variants = [];
  let current = String(value || "").slice(0, MAX_DECODE_INPUT_CHARS);
  for (let index = 0; index <= MAX_DECODE_ROUNDS; index += 1) {
    if (!variants.includes(current)) variants.push(current);
    if (index === MAX_DECODE_ROUNDS) break;
    const decoded = decodePercentBytesTolerantly(current);
    if (decoded === current) break;
    current = decoded;
  }
  return variants;
}

function replaceMalformedPercentEscape(value, consumeAlphanumeric) {
  const source = String(value || "");
  let result = "";
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== "%" || /^[0-9A-Fa-f]{2}$/.test(source.slice(index + 1, index + 3))) {
      result += source[index];
      continue;
    }
    result += " ";
    let consumed = 0;
    while (consumed < consumeAlphanumeric && /[A-Za-z0-9]/.test(source[index + 1] || "")) {
      index += 1;
      consumed += 1;
    }
  }
  return result;
}

function securityDecodedVariants(value) {
  const variants = decodedVariants(value);
  for (const variant of [...variants]) {
    for (const consume of [0, 1, 2]) {
      const normalized = replaceMalformedPercentEscape(variant, consume);
      if (!variants.includes(normalized)) variants.push(normalized);
    }
  }
  return variants;
}

function securityScanWindows(value) {
  const source = String(value || "");
  if (source.length <= MAX_DECODE_INPUT_CHARS) return [source];
  const windows = [];
  const step = MAX_DECODE_INPUT_CHARS - SECURITY_SCAN_OVERLAP_CHARS;
  for (let start = 0; start < source.length; start += step) {
    windows.push(source.slice(start, start + MAX_DECODE_INPUT_CHARS));
    if (start + MAX_DECODE_INPUT_CHARS >= source.length) break;
  }
  return windows;
}

function isExcessivelyEncoded(value) {
  let current = String(value || "").slice(0, MAX_DECODE_INPUT_CHARS);
  for (let index = 0; index < MAX_DECODE_ROUNDS; index += 1) {
    const decoded = decodePercentBytesTolerantly(current);
    if (decoded === current) return false;
    current = decoded;
  }
  return decodePercentBytesTolerantly(current) !== current;
}

function urlsInValue(value) {
  const urls = [];
  const seen = new Set();
  for (const variant of securityDecodedVariants(value)) {
    const matches = [
      ...(variant.match(URL_PATTERN) || []),
      ...(variant.match(SCHEME_RELATIVE_URL_PATTERN) || []).map((match) => `https:${match}`),
    ];
    if (matches.length === 0 && /^[a-z][a-z0-9+.-]*:\/\//i.test(variant)) matches.push(variant);
    for (const match of matches) {
      const { candidate } = splitTrailingUrlPunctuation(match);
      try {
        const url = new URL(candidate);
        const key = url.toString();
        if (!seen.has(key)) {
          seen.add(key);
          urls.push(url);
        }
      } catch {
        // Ignore malformed nested values; the outer URL validation handles them.
      }
    }
  }
  return urls;
}

function urlHasCredentialPath(url) {
  const hostname = url.hostname.toLowerCase();
  if (hostname === "hooks.slack.com" && /^\/services\/[^/]+\/[^/]+\/[^/]+(?:\/|$)/i.test(url.pathname)) return true;
  if ((hostname === "discord.com"
    || hostname.endsWith(".discord.com")
    || hostname === "discordapp.com"
    || hostname.endsWith(".discordapp.com"))
    && /^\/api(?:\/v\d+)?\/webhooks\/[^/]+\/[^/]+(?:\/|$)/i.test(url.pathname)) return true;
  return false;
}

export function containsPrivateEndpointReference(value) {
  return urlsInValue(value).some((url) => isPrivateNetworkHostname(url.hostname));
}

export function containsCredentialUrlReference(value) {
  return urlsInValue(value).some((url) => Boolean(url.username || url.password || urlHasCredentialPath(url)));
}

function urlContainsSensitiveMaterial(url, depth = 0) {
  if (isPrivateNetworkHostname(url.hostname) || url.username || url.password || urlHasCredentialPath(url)) return true;
  if (pathnameIsSensitive(url.pathname, depth + 1)) return true;
  for (const [key, parameterValue] of url.searchParams.entries()) {
    if (isSensitiveUrlKey(key) || isExcessivelyEncoded(parameterValue)) return true;
    if (depth < 6 && containsSensitiveUrlReference(parameterValue, depth + 1)) return true;
  }
  return fragmentIsSensitive(url.hash, depth + 1);
}

function pathnameIsSensitive(value, depth = 0) {
  const raw = String(value || "");
  if (!raw) return false;
  if (raw.length > MAX_DECODE_INPUT_CHARS) return true;
  if (isExcessivelyEncoded(raw)) return true;
  for (const variant of securityDecodedVariants(raw)) {
    if (containsDirectSecretPattern(variant)) return true;
    for (const nestedUrl of urlsInValue(variant)) {
      if (depth > 6 || urlContainsSensitiveMaterial(nestedUrl, depth + 1)) return true;
    }
    const assignments = variant.matchAll(/(?:^|[/?#&;])([A-Za-z][A-Za-z0-9_.-]{0,200})\s*[:=]/g);
    for (const match of assignments) {
      if (isSensitiveUrlKey(match[1])) return true;
    }
  }
  return false;
}

export function containsSensitiveUrlReference(value, depth = 0) {
  const urls = urlsInValue(value);
  if (depth > 6) return urls.length > 0 || isExcessivelyEncoded(value);
  return urls.some((url) => urlContainsSensitiveMaterial(url, depth));
}

function fragmentIsSensitive(value, depth = 0) {
  const raw = String(value || "").replace(/^#/, "");
  if (!raw) return false;
  if (isExcessivelyEncoded(raw)) return true;
  for (const variant of securityDecodedVariants(raw)) {
    if (containsDirectSecretPattern(variant)) return true;
    const params = new URLSearchParams(variant);
    for (const [key, parameterValue] of params.entries()) {
      if (isSensitiveUrlKey(key)
        || containsPrivateEndpointReference(parameterValue)
        || containsCredentialUrlReference(parameterValue)
        || (depth < 6 && containsSensitiveUrlReference(parameterValue, depth + 1))) return true;
    }
    if (containsPrivateEndpointReference(variant) || containsCredentialUrlReference(variant)) return true;
    if (depth < 6 && containsSensitiveUrlReference(variant, depth + 1)) return true;
    if (isSensitiveUrlKey(variant) || /(?:token|secret|password|signature|credential)\s*[:=]/i.test(variant)) return true;
  }
  return false;
}

function sanitizeUrl(rawValue) {
  const { candidate, suffix } = splitTrailingUrlPunctuation(rawValue);
  try {
    const url = new URL(candidate);
    if (isPrivateNetworkHostname(url.hostname)) return `[REDACTED_PRIVATE_ENDPOINT]${suffix}`;
    if (urlHasCredentialPath(url)) return `[REDACTED_CREDENTIAL_URL]${suffix}`;
    if (pathnameIsSensitive(url.pathname)) return `[REDACTED_SENSITIVE_URL]${suffix}`;
    let changed = false;
    if (url.username || url.password) {
      url.username = "";
      url.password = "";
      changed = true;
    }
    for (const [key, parameterValue] of [...url.searchParams.entries()]) {
      if (isSensitiveUrlKey(key)
        || isExcessivelyEncoded(parameterValue)
        || securityDecodedVariants(parameterValue).some(containsDirectSecretPattern)
        || containsPrivateEndpointReference(parameterValue)
        || containsCredentialUrlReference(parameterValue)
        || containsSensitiveUrlReference(parameterValue)) {
        url.searchParams.set(key, "[REDACTED]");
        changed = true;
      }
    }
    if (fragmentIsSensitive(url.hash)) {
      url.hash = "";
      changed = true;
    }
    return changed ? `${url.toString()}${suffix}` : rawValue;
  } catch {
    return rawValue;
  }
}

function redactSensitiveAssignments(value) {
  const specificallyRedacted = String(value).replace(
    SENSITIVE_ASSIGNMENT_PATTERN,
    (_match, prefix, keyQuote, key, separator, valueQuote) => {
      const renderedValue = valueQuote ? `${valueQuote}[REDACTED]${valueQuote}` : "[REDACTED]";
      return `${prefix}${keyQuote}${key}${keyQuote}${separator}${renderedValue}`;
    },
  );
  const genericAssignmentPattern = /(^|[\s{[(,;:])(["']?)([A-Za-z_][A-Za-z0-9_.-]{0,200})\2\s*([:=])\s*(?!\[REDACTED(?:_[A-Z]+)?\])(?:(['"])((?:\\.|(?!\5)[^\\]){0,10000})\5|([^,\s)\]}]+))/gim;
  return specificallyRedacted.replace(
    genericAssignmentPattern,
    (match, prefix, keyQuote, key, separator, valueQuote) => {
      if (!isSensitiveUrlKey(key)) return match;
      const renderedValue = valueQuote ? `${valueQuote}[REDACTED]${valueQuote}` : "[REDACTED]";
      return `${prefix}${keyQuote}${key}${keyQuote}${separator}${renderedValue}`;
    },
  );
}

function redactBarePrivateAddresses(value) {
  return String(value)
    .replace(
      /\b(?:localhost|(?:[A-Za-z0-9-]+\.)+(?:localhost|local|internal|lan|home\.arpa))\b/gi,
      "[REDACTED_PRIVATE_HOST]",
    )
    .replace(
      /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/g,
      (candidate) => (isPrivateNetworkHostname(candidate) ? "[REDACTED_PRIVATE_ADDRESS]" : candidate),
    )
    .replace(
      /(?<![A-Za-z0-9])\[?[A-Fa-f0-9:.]*:[A-Fa-f0-9:.]*\]?(?![A-Za-z0-9])/g,
      (candidate) => {
        const normalized = candidate.replace(/^\[|\]$/g, "");
        return isIP(normalized) === 6 && isPrivateNetworkHostname(normalized)
          ? "[REDACTED_PRIVATE_ADDRESS]"
          : candidate;
      },
    );
}

function redactDirectSecretPatterns(value) {
  return redactSensitiveAssignments(String(value || ""))
    .replace(/-----BEGIN (?:(?:(?:RSA|EC|DSA|OPENSSH|ENCRYPTED) )?PRIVATE KEY|PGP PRIVATE KEY BLOCK)-----[\s\S]*?-----END (?:(?:(?:RSA|EC|DSA|OPENSSH|ENCRYPTED) )?PRIVATE KEY|PGP PRIVATE KEY BLOCK)-----/g, "[REDACTED_PRIVATE_KEY]")
    .replace(/\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/g, "[REDACTED_TELEGRAM_TOKEN]")
    .replace(/\btskey-(?:auth|api|client)-[A-Za-z0-9_-]{8,}\b/gi, "[REDACTED_TAILSCALE_KEY]")
    .replace(/\b(?:npm|hf)_[A-Za-z0-9_-]{12,}\b/g, "[REDACTED_TOKEN]")
    .replace(/\bwhsec_[A-Za-z0-9_-]{12,}\b/gi, "[REDACTED_TOKEN]")
    .replace(/\bglpat-[A-Za-z0-9_-]{12,}\b/gi, "[REDACTED_TOKEN]")
    .replace(/\bSG\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_TOKEN]")
    .replace(/\bAGE-SECRET-KEY-1[A-Z0-9]{20,}\b/gi, "[REDACTED_PRIVATE_KEY]")
    .replace(/\b(?:sk|pk|rk|ak|sess|gh[pousr]|github_pat|xox[baprs])[_-][A-Za-z0-9_-]{12,}\b/g, "[REDACTED_TOKEN]")
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, "[REDACTED_AWS_KEY]")
    .replace(/\bAIza[A-Za-z0-9_-]{30,}\b/g, "[REDACTED_GOOGLE_KEY]")
    .replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_JWT]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, "Bearer [REDACTED]")
    .replace(/\bBasic\s+[A-Za-z0-9+/=]{8,}/gi, "Basic [REDACTED]");
}

function containsDirectSecretPattern(value) {
  const source = String(value || "");
  return redactDirectSecretPatterns(source) !== source;
}

function containsSensitiveDecodedVariant(value) {
  const source = String(value || "");
  if (source.length > MAX_SECURITY_SCAN_CHARS) return true;
  return securityScanWindows(source).some((window) => {
    if (isExcessivelyEncoded(window)) return true;
    const sourceContainsUrl = (window.match(URL_PATTERN) || []).length > 0;
    return securityDecodedVariants(window).some((variant) => variant !== window && (
      containsDirectSecretPattern(variant)
      || (!sourceContainsUrl && containsSensitiveUrlReference(variant))
      || redactBarePrivateAddresses(variant) !== variant
      || /\b(?:[A-Za-z0-9-]+\.)*ts\.net\b/i.test(variant)
    ));
  });
}

export function redactSensitiveText(value) {
  const source = String(value || "");
  if (source.length > MAX_SECURITY_SCAN_CHARS) return "[REDACTED_OVERSIZED_INPUT]";
  const withoutTerminalControls = source
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
    .replace(/(^|[\s{[(,;])(Authorization|Proxy-Authorization)\s*:\s*(?:Basic|Bearer)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1$2: [REDACTED]")
    .replace(/(^|\r?\n)(Authorization|Proxy-Authorization|Cookie|Set-Cookie)\s*:\s*[^\r\n]*/gi, "$1$2: [REDACTED]");
  const redacted = redactBarePrivateAddresses(redactDirectSecretPatterns(withoutTerminalControls)
    .replace(URL_PATTERN, sanitizeUrl)
    .replace(/\b(?:[A-Za-z0-9-]+\.)*ts\.net\b/gi, "[REDACTED_TAILSCALE_HOST]"));
  if (containsSensitiveDecodedVariant(redacted)) return "[REDACTED_ENCODED_SECRET]";
  return redacted;
}

function literalPattern(value) {
  return new RegExp(String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
}

function normalizedFilesystemPath(value) {
  return String(value || "").trim().replaceAll("\\", "/").replace(/\/$/, "");
}

export function redactFilesystemPaths(value, options = {}) {
  let output = redactSensitiveText(value);
  const mappings = [
    [options.projectRoot, "<PROJECT_ROOT>"],
    [options.stateRoot, "<PRITHA_STATE_ROOT>"],
    [options.root, "<TECHSCOPE_ROOT>"],
    [options.homeDir || os.homedir(), "<USER_HOME>"],
  ]
    .map(([candidate, replacement]) => [normalizedFilesystemPath(candidate), replacement])
    .filter(([candidate], index, values) => candidate && values.findIndex(([other]) => other === candidate) === index)
    .sort((left, right) => right[0].length - left[0].length);

  for (const [candidate, replacement] of mappings) {
    const variants = new Set([candidate, candidate.replaceAll("/", "\\")]);
    for (const variant of variants) output = output.replace(literalPattern(variant), replacement);
  }
  return output
    .replace(/file:\/\/(?:<[^>]+>)/g, (match) => match.slice("file://".length))
    .replace(/\/(?:Users|home)\/[A-Za-z0-9._-]+/g, "<USER_HOME>")
    .replace(/[A-Za-z]:\\Users\\[A-Za-z0-9._-]+/gi, "<USER_HOME>")
    .replace(/\/(?:private\/)?var\/(?:folders|tmp)\/[A-Za-z0-9._~+/@%=-]+(?:\/[A-Za-z0-9._~+/@%=-]+)*/g, "<TEMP_PATH>")
    .replace(/\/tmp\/[A-Za-z0-9._~+/@%=-]+(?:\/[A-Za-z0-9._~+/@%=-]+)*/g, "<TEMP_PATH>");
}

// Redact text leaves before serialization and content locks. JSON numbers,
// booleans and schema field names must never be rewritten by text regexes.
export function redactStructuredText(value, options = {}) {
  let nodes = 0;
  const visit = (item, depth) => {
    if (++nodes > 50_000 || depth > 24) throw new Error('Redaction input exceeds structural bounds');
    if (typeof item === 'string') return redactFilesystemPaths(item, options);
    if (Array.isArray(item)) return item.map(child => visit(child, depth + 1));
    if (item && typeof item === 'object' && Object.getPrototypeOf(item) === Object.prototype) return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, visit(child, depth + 1)]));
    return item;
  };
  return visit(value, 0);
}
