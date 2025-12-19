/**
 * Normaliza texto removendo acentos, pontuação, espaços múltiplos
 * Robusta contra erros de digitação do usuário
 */
export const normalizeText = (text: string): string => {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^\w\s]/g, '') // remove pontuação
    .replace(/\s+/g, ' ') // normaliza espaços múltiplos
    .trim();
};

/**
 * Compara dois textos normalizados para igualdade exata
 */
export const normalizedEquals = (a: string, b: string): boolean => {
  return normalizeText(a) === normalizeText(b);
};

/**
 * Procura em um array de strings por um match normalizado
 */
export const findNormalizedMatch = (query: string, items: string[]): string | undefined => {
  const normalized = normalizeText(query);
  return items.find(item => normalizeText(item) === normalized);
};

/**
 * Procura por substring normalizada
 */
export const findNormalizedInclude = (query: string, items: string[]): string | undefined => {
  const normalized = normalizeText(query);
  return items.find(item => normalizeText(item).includes(normalized));
};
