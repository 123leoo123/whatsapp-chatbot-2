/**
 * Calcula a distância de Levenshtein entre duas strings
 * (quantas edições são necessárias para transformar uma em outra)
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len2; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len1; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len2; i++) {
    for (let j = 1; j <= len1; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[len2][len1];
}

/**
 * Encontra o item mais similar em uma lista
 * Retorna o item e a similaridade (0-100%)
 * Threshold: porcentagem mínima de similaridade (padrão 70%)
 */
export function findClosestMatch(
  query: string,
  candidates: string[],
  threshold: number = 70
): { match: string | null; similarity: number } {
  if (!candidates.length) {
    return { match: null, similarity: 0 };
  }

  const normalize = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  const normalizedQuery = normalize(query);
  const maxLen = Math.max(normalizedQuery.length, ...candidates.map(c => c.length));

  let bestMatch: string | null = null;
  let bestSimilarity = 0;

  for (const candidate of candidates) {
    const normalizedCandidate = normalize(candidate);

    // Primeiro tenta match exato normalizado
    if (normalizedCandidate === normalizedQuery) {
      return { match: candidate, similarity: 100 };
    }

    // Depois tenta fuzzy matching
    const distance = levenshteinDistance(normalizedQuery, normalizedCandidate);
    const similarity = ((maxLen - distance) / maxLen) * 100;

    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestMatch = candidate;
    }
  }

  // Só retorna se ultrapassar o threshold
  if (bestSimilarity >= threshold) {
    return { match: bestMatch, similarity: bestSimilarity };
  }

  return { match: null, similarity: bestSimilarity };
}
