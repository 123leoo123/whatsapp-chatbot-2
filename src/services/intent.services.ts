
// const normalize = (text: string) =>
//   text
//     .toLowerCase()
//     .normalize('NFD')
//     .replace(/[\u0300-\u036f]/g, '')
//     .trim();

// export const detectIntent = (text: string) => {
//   const t = normalize(text);

//   if (['oi', 'ola', 'bom dia', 'boa tarde', 'boa noite'].includes(t)) {
//     return { intent: 'GREETING' };
//   }

//   if (t.includes('produto') || t.includes('ver')) {
//     return { intent: 'LIST_PRODUCTS' };
//   }

//   if (t.includes('endereco') || t.includes('onde fica')) {
//     return { intent: 'ADDRESS' };
//   }

//   if (t.includes('horario')) {
//     return { intent: 'BUSINESS_HOURS' };
//   }

//   if (t.includes('pagamento') || t.includes('paga') || t.includes('pix')) {
//     return { intent: 'PAYMENT' };
//   }

//   if (t.includes('atendente') || t.includes('humano')) {
//     return { intent: 'HUMAN' };
//   }

//   // fallback → pode ser nome de produto
//   return { intent: 'PRODUCT_QUERY', query: t };
// };
