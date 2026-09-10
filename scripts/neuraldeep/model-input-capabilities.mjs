// Public metadata normalization; safe in both browser and server bundles.
export function declaredModelInputs(value) {
  const raw = value?.modalities?.input;
  const inputModalities = Array.isArray(raw) && raw.length > 0 && raw.length <= 12
    && raw.every(item => typeof item === "string" && /^[a-z][a-z0-9_-]{0,31}$/.test(item))
    ? [...new Set(raw)] : null;
  const advertised = value?.capabilities || {};
  const vision = Object.hasOwn(value || {}, "visionAdvertised") ? value.visionAdvertised : advertised.vision;
  const tools = Object.hasOwn(value || {}, "toolsAdvertised") ? value.toolsAdvertised
    : typeof advertised.tools === "boolean" ? advertised.tools : value?.tool_call;
  return { inputModalities, visionAdvertised: typeof vision === "boolean" ? vision : null,
    toolsAdvertised: typeof tools === "boolean" ? tools : null };
}
