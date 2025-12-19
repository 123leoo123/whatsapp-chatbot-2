/**
 * 🎭 Response Helper
 * Generates varied, natural responses to avoid bot-like repetition
 */

const VARIED_RESPONSES = {
  category: [
    'Temos essas opções em',
    'Aqui estão os itens em',
    'Você pode escolher entre',
    'Nossas linhas em',
    'Na categoria',
  ],
  question: [
    'Qual você gostaria de explorar?',
    'Qual delas te interessa?',
    'Qual você quer conhecer melhor?',
    'O que você procura?',
    'Qual você gostaria de ver?',
  ],
  product_list: [
    'Temos essas opções:',
    'Esses são nossos produtos:',
    'Aqui estão as nossas peças:',
    'Confira o que temos:',
    'Essas são nossas opções:',
  ],
  ask_product: [
    'Fique à vontade para tirar dúvidas sobre qualquer um.',
    'Posso ajudá-lo com informações sobre eles.',
    'Manda a pergunta sobre qualquer um deles!',
    'Qual deles você gostaria de saber mais?',
    'Quer saber detalhes de algum?',
  ],
  not_found: [
    'Não encontrei nada com esse nome.',
    'Desculpa, não localizei isso.',
    'Hmm, não achei nada assim.',
    'Não temos isso disponível no momento.',
    'Esse item não está no nosso catálogo.',
  ],
};

/**
 * Get a random response from an array
 */
const getRandomResponse = (responses: string[]): string => {
  return responses[Math.floor(Math.random() * responses.length)];
};

/**
 * Mount a natural category presentation response
 */
export const mountCategoryResponse = (category: string, subcategories: string[]): string => {
  const intro = getRandomResponse(VARIED_RESPONSES.category);
  const list = subcategories.filter(Boolean).map(s => `• ${s}`).join('\n');
  const question = getRandomResponse(VARIED_RESPONSES.question);
  return `${intro} *${category}*:\n${list}\n\n${question}`;
};

/**
 * Mount a natural product list response
 */
export const mountProductListResponse = (
  products: Array<{ name: string; price: number }>
): string => {
  const intro = getRandomResponse(VARIED_RESPONSES.product_list);
  const list = products.map(p => `• ${p.name} — R$${p.price}`).join('\n');
  const question = getRandomResponse(VARIED_RESPONSES.ask_product);
  return `${intro}\n${list}\n\n${question}`;
};

/**
 * Mount a natural "not found" response
 */
export const mountNotFoundResponse = (): string => {
  const response = getRandomResponse(VARIED_RESPONSES.not_found);
  return `${response}\nTente buscar uma categoria ou subcategoria.`;
};
