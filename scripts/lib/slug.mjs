export function transliterate(value) {
  const map = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
    к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
    х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  return String(value).replace(/[а-яё]/giu, (char) => {
    const lower = char.toLowerCase();
    const mapped = map[lower] ?? "";
    return char === lower ? mapped : mapped.toUpperCase();
  });
}

export function slug(value, options = {}) {
  const fallback = options.fallback || "item";
  const maxLength = options.maxLength || 0;
  const stripUrls = options.stripUrls || false;
  const allowCyrillic = options.allowCyrillic || false;
  const transliterateInput = options.transliterate ?? !allowCyrillic;
  const source = stripUrls ? String(value).replace(/https?:\/\//g, "") : String(value);
  const normalized = transliterateInput ? transliterate(source) : source;
  const pattern = allowCyrillic ? /[^a-z0-9а-яё]+/giu : /[^a-z0-9]+/g;
  const clean = normalized
    .trim()
    .toLowerCase()
    .replace(pattern, "-")
    .replace(/^-+|-+$/g, "");
  const clipped = maxLength > 0 ? clean.slice(0, maxLength).replace(/-+$/g, "") : clean;
  return clipped || fallback;
}
