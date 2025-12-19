type IntentResult =
  | { intent: 'GREETING' }
  | { intent: 'LIST_PRODUCTS' }
  | { intent: 'ADDRESS' }
  | { intent: 'BUSINESS_HOURS' }
  | { intent: 'PAYMENT' }
  | { intent: 'HUMAN' }
  | { intent: 'PRODUCT_QUERY'; query: string };

/* =====================================================
   NORMALIZA TEXTO
===================================================== */
const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

/* =====================================================
   LEVENSHTEIN (erro de digitação leve)
===================================================== */
const levenshtein = (a: string, b: string): number => {
  const matrix = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0)
  );

  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
};

const isApproxMatch = (input: string, target: string) =>
  levenshtein(input, target) <= 2;

/* =====================================================
   CATEGORIAS CONHECIDAS (DETERMINÍSTICO)
===================================================== */
const KNOWN_CATEGORIES = [
  'camisas',
  'calcas',
  'bermudas',
  'agasalhos',
  'acessorios',
  'moda intima',
];

/* =====================================================
   DETECT INTENT
===================================================== */
export const detectIntent = (text: string): IntentResult => {
  const t = normalize(text);

  if (['oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'iae', 'eae', 'opa'].includes(t)) {
    return { intent: 'GREETING' };
  }

  if (t === '1' || t.includes('produto') || t.includes('ver produto')) {
    return { intent: 'LIST_PRODUCTS' };
  }

  if (t === '2' || t.includes('endereco') || t.includes('onde fica')) {
    return { intent: 'ADDRESS' };
  }

  if (t.includes('horario')) {
    return { intent: 'BUSINESS_HOURS' };
  }

  if (t.includes('pagamento') || t.includes('paga') || t.includes('pix')) {
    return { intent: 'PAYMENT' };
  }

  if (t === '3' || t.includes('atendente') || t.includes('humano')) {
    return { intent: 'HUMAN' };
  }

  /* =====================================================
     🔎 APROXIMAÇÃO DE CATEGORIA
  ===================================================== */
  const words = t.split(' ');

  for (const word of words) {
    for (const category of KNOWN_CATEGORIES) {
      if (isApproxMatch(word, category)) {
        return { intent: 'PRODUCT_QUERY', query: category };
      }
    }
  }

  // fallback → produto, subcategoria ou frase livre
  return { intent: 'PRODUCT_QUERY', query: t };
};
