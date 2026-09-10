const STYLE_PRESETS: Record<string, string> = {
  organ: "soft pipe organ ambient, warm sustained organ chords, slow harmonic movement, spacious reverb",
  "organ ambient": "soft pipe organ ambient, warm sustained organ chords, slow harmonic movement, spacious reverb",
  ambient: "calm ambient pads, slow evolving texture, warm and unobtrusive",
  piano: "soft felt piano, gentle minimal harmony, calm reflective mood",
  lofi: "soft lo-fi instrumental, gentle beat, warm tape texture, unobtrusive",
  orchestral: "soft cinematic orchestral underscore, warm strings, no percussion hits",
  cyberpunk: "soft futuristic synth ambience, subtle pulse, dark but non-distracting",
};

type MusicPromptBuildOptions = {
  operatorRequest?: string;
  preserveCurrent?: boolean;
  referenceStyle?: string;
  referencePrompt?: string;
};

const NEGATIVE_CONSTRAINTS = [
  {
    id: "drums",
    request: /\b(no|without|remove|avoid|exclude)\s+(?:all\s+)?(?:drums?|drumming|drum\s*machine|percussion|percussive|beat|rhythm)\b|(?:убрать|без|исключить)\s+(?:все\s+)?(?:ударн\w*|барабан\w*|перкусси\w*|ритм\w*)/iu,
    provider: /\b(drums?|drumming|drum\s*machine|percussion|percussive|kick|snare|hi-?hat|cymbals?|beat|rhythm(?:ic)?)\b/iu,
    safe:
      /\b(?:drumless|non[-\s]?percussive|percussionless)\b|\b(no|without|avoid|exclude|remove)\s+(?:all\s+)?(?:drums?|drumming|drum\s*machine|percussion|percussive|rhythmic\s+beat|beat|rhythm)|(?:no|without)\s+(?:kick|snare|hi-?hat|cymbals?)\b/giu,
    instruction:
      "Strict exclusion: no drums, no percussion, no drum machine, no kick, no snare, no hi-hats, no cymbals, no rhythmic beat. Use only non-percussive textures, sustained tones, drones, pads, or melodic instruments.",
  },
  {
    id: "vocals",
    request: /\b(no|without|remove|avoid|exclude)\s+(?:vocals?|lyrics?|singer|singing|spoken\s+words?)\b|(?:без|убрать|исключить)\s+(?:вокал\w*|слов\w*|текст\w*|пени\w*)/iu,
    provider: /\b(vocals?|lyrics?|singer|singing|spoken\s+words?|voice|vocalizations?)\b/iu,
    safe: /\b(no|without|avoid|exclude|remove|instrumental[-\s]?only)\s+(?:vocals?|lyrics?|singer|singing|spoken\s+words?|voice|vocalizations?)\b/giu,
    instruction: "Strict exclusion: no vocals, no lyrics, no singing, no spoken words, no voice-like lead.",
  },
  {
    id: "piano",
    request: /\b(no|without|remove|avoid|exclude)\s+(?:piano|keys?|keyboards?)\b|(?:без|убрать|исключить)\s+(?:пианино|фортепиано|клавишн\w*)/iu,
    provider: /\b(piano|keys?|keyboards?|electric\s+piano)\b/iu,
    safe: /\b(no|without|avoid|exclude|remove)\s+(?:piano|keys?|keyboards?|electric\s+piano)\b/giu,
    instruction: "Strict exclusion: no piano, no keys, no keyboards, no electric piano.",
  },
  {
    id: "strings",
    request: /\b(no|without|remove|avoid|exclude)\s+(?:strings?|violins?|cello|orchestra)\b|(?:без|убрать|исключить)\s+(?:струнн\w*|скрип\w*|виолончел\w*|оркестр\w*)/iu,
    provider: /\b(strings?|violins?|cello|orchestra|orchestral)\b/iu,
    safe: /\b(no|without|avoid|exclude|remove)\s+(?:strings?|violins?|cello|orchestra|orchestral)\b/giu,
    instruction: "Strict exclusion: no strings, no violin, no cello, no orchestra.",
  },
];

function compactMusicText(value: unknown, maxChars = 900) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1).trim()}...`;
}

function combinedIntent(style: string, options: MusicPromptBuildOptions = {}) {
  return [style, options.operatorRequest, options.referenceStyle].map((value) => String(value || "")).join(" ");
}

function hasPreserveCurrentIntent(style: string, options: MusicPromptBuildOptions = {}) {
  if (options.preserveCurrent) return true;
  return /\b(keep|preserve|same|as\s+is|only\s+change|leave)\b|(?:оставь|сохрани|как есть|только\s+убрать|только\s+изменить)/iu.test(
    combinedIntent(style, options),
  );
}

function negativeConstraintsFor(style: string, options: MusicPromptBuildOptions = {}) {
  const text = combinedIntent(style, options);
  return NEGATIVE_CONSTRAINTS.filter((constraint) => constraint.request.test(text));
}

function removeSafeNegativePhrases(value: string, safe: RegExp) {
  safe.lastIndex = 0;
  return value.replace(safe, " ");
}

export function normalizeMusicStyleKey(style: string) {
  return String(style || "ambient")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "ambient";
}

export function normalizeStyleForPrompt(style: string) {
  const key = normalizeMusicStyleKey(style);
  return STYLE_PRESETS[key] || key;
}

export function buildBackgroundMusicPrompt(style: string, options: MusicPromptBuildOptions = {}) {
  const operatorRequest = compactMusicText(options.operatorRequest);
  const referenceStyle = compactMusicText(options.referenceStyle, 260);
  const referencePrompt = compactMusicText(options.referencePrompt, 520);
  const constraints = negativeConstraintsFor(style, options);
  return [
    "Instrumental-only background music for coding and voice assistant accompaniment.",
    operatorRequest ? `Operator request, highest priority musical intent: ${operatorRequest}.` : "",
    `Style: ${normalizeStyleForPrompt(style)}.`,
    hasPreserveCurrentIntent(style, options)
      ? "Create a new variation that preserves the current track's mood, texture, tempo feel, and instrumentation as much as possible; change only the attributes explicitly requested by the operator."
      : "",
    referenceStyle ? `Current/reference style to preserve when compatible: ${referenceStyle}.` : "",
    referencePrompt ? `Reference prompt summary to preserve when compatible: ${referencePrompt}.` : "",
    "Do not replace the operator request with a generic upbeat, rock, cinematic, orchestral, or pop cue unless the operator explicitly asked for that.",
    ...constraints.map((constraint) => constraint.instruction),
    "No vocals, no lyrics, no spoken words.",
    constraints.some((constraint) => constraint.id === "drums")
      ? "Avoid any pulse or groove that could be perceived as a drum part."
      : "Unobtrusive, soft dynamics, low dynamic range, no sudden hits, no aggressive drums.",
    "Leave space for spoken voice and avoid lead vocal-like melodies.",
    "Smooth intro and outro, seamless loop feeling.",
    "Suitable as background under a realtime voice assistant.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function findMusicPromptMismatches(input: { style?: string; operatorRequest?: string; sentPrompt?: string; providerPrompt?: string }) {
  const style = input.style || "";
  const operatorRequest = input.operatorRequest || "";
  const providerPrompt = compactMusicText(input.providerPrompt, 4_000);
  const sentPrompt = compactMusicText(input.sentPrompt, 4_000);
  if (!providerPrompt) return [];
  if (sentPrompt && providerPrompt === sentPrompt) return [];
  const providerOnlyPrompt = sentPrompt && providerPrompt.includes(sentPrompt) ? providerPrompt.replace(sentPrompt, " ") : providerPrompt;
  const constraints = negativeConstraintsFor(style, { operatorRequest });
  const warnings: string[] = [];
  for (const constraint of constraints) {
    const providerWithoutSafePhrases = removeSafeNegativePhrases(providerOnlyPrompt.toLowerCase(), constraint.safe);
    if (constraint.provider.test(providerWithoutSafePhrases)) {
      warnings.push(`provider_prompt_conflicts_with_no_${constraint.id}`);
    }
  }
  return warnings;
}
