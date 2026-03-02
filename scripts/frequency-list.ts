import frequencyList from "../data/frequency-list.json";

/** Set of top 5000 most common English words (Google Trillion Word Corpus) */
export const TOP_WORDS = new Set<string>(
  frequencyList.map((w) => w.toLowerCase())
);

export function isInVocabulary(word: string): boolean {
  return TOP_WORDS.has(word.toLowerCase());
}
