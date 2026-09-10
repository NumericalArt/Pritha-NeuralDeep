/** Conservative hints from the original user message, never assembled prompts or tool output. */
export function searchIntent(text = "") {
  const value = String(text).slice(0, 16000);
  const denied =
    /(?:do\s+not|don't|never|without)\s+(?:start\s+|do\s+|run\s+|use\s+)?(?:research|search)|(?:не\s+(?:запускай|делай|проводи|нужно|надо)|без)\s+(?:глубок\w*\s+)?(?:исслед|ресерч|поиск)/i.test(
      value,
    );
  if (denied) return { explicit: false, researchExplicit: false };
  return {
    explicit:
      /(?:найди|найти|поищи|поиск|провер|актуаль|свеж|сейчас|интернет|search|look up|verify|current|latest)/i.test(
        value,
      ),
    researchExplicit:
      /(?:проведи|сделай|выполни|запусти|нужно|хочу)\s+(?:[\p{L}-]+\s+){0,3}(?:исследование|ресерч)|(?:исследуй)|\b(?:research\s+(?:this|the|on)|(?:do|run|start|conduct|perform)\s+(?:a\s+|deep\s+)?research)\b/iu.test(
        value,
      ),
  };
}
