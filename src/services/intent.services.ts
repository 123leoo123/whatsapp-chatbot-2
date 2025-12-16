type IntentResult =
  | { intent: 'GREETING' }
  | { intent: 'LIST_PRODUCTS' }
  | { intent: 'ADDRESS' }
  | { intent: 'BUSINESS_HOURS' }
  | { intent: 'PAYMENT' }
  | { intent: 'HUMAN' }
  | { intent: 'PRODUCT_QUERY'; query: string };

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

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

  // fallback → assume nome de produto
  return { intent: 'PRODUCT_QUERY', query: t };
};
