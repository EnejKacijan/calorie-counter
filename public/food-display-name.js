// Presentation only: never use this string for identity, search, or persistence.
export function formatFoodDisplayName(food, fallback = '') {
  const name = typeof food?.name === 'string' ? food.name : '';
  if (!name.trim()) return fallback;
  if (food.nameEdited === true) return name;

  const source = String(food.originalSource || food.source || '').trim();
  // Explicit manual/catalog provenance wins over any retained estimate metadata.
  if (/^(?:manual|usda|off|open food facts)(?:\b|$)/i.test(source)) return name;
  const generated = ['photo', 'text'].includes(food.aiEstimate?.inputMode)
    || /^(?:openai\s+)?(?:photo|image|vision)(?:\s+(?:estimate|scan))?$/i.test(source)
    || /^(?:ai|openai)(?:\s+(?:food|text))?\s+estimate$/i.test(source)
    || /^label\s*[·:-]\s*ai transcription$/i.test(source);
  if (!generated) return name;

  // Legacy records have no edited-name flag. Preserve brand-like camel casing
  // (eBay, iPhone) rather than guessing a new spelling for an ambiguous name.
  const word = name.match(/\p{L}[\p{L}\p{M}]*/u)?.[0] || '';
  if (/^\p{Ll}[\p{Ll}\p{M}]*\p{Lu}/u.test(word)) return name;
  return name.replace(/\p{L}/u, letter => {
    const upper = letter.toUpperCase();
    // Avoid multi-letter expansions such as ß -> SS and decomposed ligatures.
    return [...upper].length === 1 ? upper : letter;
  });
}
