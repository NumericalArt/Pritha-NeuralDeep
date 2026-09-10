import path from "node:path";
import { envStoreTargetPath, findEnvSecret, maskSecret, writeEnvSecret } from "./env-store";

type OpenAISecretName = "OPENAI_API_KEY";

function statusFor(name: OpenAISecretName) {
  const found = findEnvSecret(name);
  const configured = Boolean(found.value);
  return {
    name,
    configured,
    status: configured ? "ready" : "missing",
    source: found.source,
    storageTarget: found.filePath ? path.basename(found.filePath) : path.basename(envStoreTargetPath()),
    maskedValue: maskSecret(found.value),
    lastUpdated: found.lastUpdated,
    browserExposure: "ephemeral_only",
    purpose: "Realtime Voice Control server-side session creation",
  };
}

export function getOpenAICredentialsStatus() {
  return {
    openaiApiKey: statusFor("OPENAI_API_KEY"),
  };
}

export function saveOpenAISecret(name: OpenAISecretName, value: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("empty_secret_value");
  writeEnvSecret(name, trimmed);
  return statusFor(name);
}

export function isOpenAISecretName(value: string): value is OpenAISecretName {
  return value === "OPENAI_API_KEY";
}
