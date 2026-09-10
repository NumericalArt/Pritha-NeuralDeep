const SAFE_CODE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,95}$/;

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeCode(value) {
  const code = typeof value === "string" ? value.trim().slice(0, 96) : "";
  return SAFE_CODE.test(code) ? code.toLowerCase() : null;
}

function providerDetails(payload) {
  const root = record(payload);
  const error = record(root.error);
  const code = safeCode(error.code) || safeCode(root.code) || safeCode(error.type) || safeCode(root.type);
  const message = [typeof root.error === "string" ? root.error : null, error.message, root.message, error.detail, root.detail]
    .filter((value) => typeof value === "string")
    .join(" ")
    .slice(0, 2_000)
    .toLowerCase();
  return { code, message, type: safeCode(error.type) || safeCode(root.type) };
}

/**
 * Convert a provider response into a stable, non-secret error contract.
 * Raw provider messages are used for classification only and are never returned.
 */
export function classifyNeuralDeepProviderError({ status, payload, transportCode, retryAfter } = {}) {
  const statusCode = status != null && status !== "" && Number.isInteger(Number(status)) ? Number(status) : null;
  const details = providerDetails(payload);
  const transport = safeCode(transportCode);
  const retry = retryAfter == null || retryAfter === "" ? null : String(retryAfter).slice(0, 80);

  if (/^(?:attachment_|model_image_|image_format_|invalid_image_encoding|neuraldeep_model_identity_mismatch)/.test(transport || "")) {
    return { class: "input", code: transport, status: statusCode, retryAfter: null };
  }

  // NeuralDeep can return HTTP 401 + numeric code for a valid key whose model
  // is outside its access list. Preserve the explicit type before the status.
  if ([401,403].includes(statusCode) && [details.type, details.code].includes("key_model_access_denied")) {
    return { class: "access_denied", code: "key_model_access_denied", status: statusCode, retryAfter: null };
  }
  if (statusCode === 401) {
    return { class: "credentials", code: details.code || "invalid_credentials", status: 401, retryAfter: null };
  }
  if (statusCode === 404) {
    return { class: "model_unavailable", code: details.code || "model_unavailable", status: 404, retryAfter: null };
  }
  if (statusCode === 429) {
    return { class: "rate_limit", code: details.code || "rate_limited", status: 429, retryAfter: retry };
  }
  if (statusCode === 402) {
    return { class: "billing", code: details.code || "payment_required", status: 402, retryAfter: null };
  }
  if (statusCode === 403) {
    const billingSignal = `${details.code || ""} ${details.message}`;
    const billing = /(wallet|balance|billing|payment|insufficient|entitlement|subscription|plan|tariff|quota|credit|fund)/i.test(billingSignal);
    return billing
      ? { class: "billing", code: details.code || "billing_access_required", status: 403, retryAfter: null }
      : { class: "access_denied", code: details.code || "access_denied", status: 403, retryAfter: null };
  }
  if (statusCode != null && statusCode >= 500) {
    return { class: "outage", code: transport || details.code || "provider_unavailable", status: statusCode, retryAfter: retry };
  }
  if (statusCode == null || transport) {
    return { class: "outage", code: transport || "network_error", status: statusCode, retryAfter: retry };
  }
  return { class: "request", code: details.code || `http_${statusCode}`, status: statusCode, retryAfter: retry };
}

export function parseProviderErrorPayload(bufferOrText) {
  try {
    const text = Buffer.isBuffer(bufferOrText) ? bufferOrText.toString("utf8") : String(bufferOrText || "");
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}
