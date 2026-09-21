/** Recognize draft data, never treat it as an approved or valid brief. */
export function hasCreationBriefCandidate(text) {
  return /pritha-brief-json|<previous_brief\b|"schemaVersion"\s*:/.test(String(text));
}

export function creationAssistantDialogue(text, hasCanonicalBrief = false) {
  let result = String(text).replace(/```pritha-(?:brief|research)-json[^\S\n]*\n[\s\S]*?```/g, '');
  if (!hasCanonicalBrief) return result;
  // Only complete, recognizable proposal data is superseded by the validated
  // host brief. Surrounding questions and every operator message remain exact.
  return result.replace(/<previous_brief>\s*([\s\S]*?)\s*<\/previous_brief>/g, (whole, body) => {
    try {
      const value = JSON.parse(body);
      return value.schemaVersion === 1 && typeof value.identity?.name === 'string'
        && typeof value.goal === 'string' && Array.isArray(value.coreFunctions) ? '' : whole;
    } catch { return whole; }
  });
}

export function isCreationClarification(text) {
  // A URL query (for example ?alt=rss) is not a question from the model.
  return !hasCreationBriefCandidate(text) && /[?？]/.test(String(text).replace(/https?:\/\/[^\s<>]+/g, ''));
}
