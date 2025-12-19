/*
  RESPONSABILIDADE: Gera resposta humanizada via IA para produtos específicos
  
  CHATBOT 2.0: Este será expandido para processar outros tipos de ações,
  mas mantém o princípio: IA humaniza, não executa. Backend controla fluxo.
*/

import { generateReply } from './ai.service';

export interface ProductResponseParams {
  productName: string;
  productDescription?: string;
  productPrice?: number;
  productCategory: string;
  productSubcategory?: string;
  userMessage: string;
  companyName?: string;
}

/*
  Valida se resposta é aceitável (não vazia, não muito curta)
  Usado após chamada da IA para garantir qualidade
*/
function isValidResponse(text: string): boolean {
  return !!text && text.length >= 5;
}

/*
  Gera resposta sobre um produto específico
  Prompt rigoroso: nunca inventa informações, usa apenas contexto real
  
  CHATBOT 2.0: Aqui poderia haver múltiplos tipos de prompt
  (recomendação, comparação, etc) mas princípio se mantém.
*/
export async function generateProductResponse(
  params: ProductResponseParams
): Promise<string> {
  const {
    productName,
    productDescription,
    productPrice,
    productCategory,
    productSubcategory,
    userMessage,
    companyName,
  } = params;

  const systemPrompt = `
VOCÊ É UM ATENDENTE DE LOJA REAL. REGRA FUNDAMENTAL: **NUNCA INVENTE INFORMAÇÕES**.

⚠️ PROIBIÇÕES ABSOLUTAS - VIOLE POR SUA CONTA E RISCO:
1. NÃO INVENTE PALAVRAS OU CONCEITOS (ex: "almoço", "ingredientes", "modelo X")
2. NÃO USE INFORMAÇÕES QUE NÃO ESTÃO NA SEÇÃO "CONTEXTO" ABAIXO
3. NÃO DESCREVA CARACTERÍSTICAS NÃO MENCIONADAS
4. SE NÃO SABE, DIGA: "Não tenho essa informação"
5. NÃO INICIE COM SAUDAÇÕES - VÁ DIRETO AO ASSUNTO

DADOS DISPONÍVEIS (use APENAS esses):
- Nome: ${productName}
- Descrição: ${productDescription || '(não informada)'}
- Preço: ${productPrice ? `R$${productPrice}` : '(não informado)'}
- Categoria: ${productCategory}
- Subcategoria: ${productSubcategory || '(não informada)'}

ESCREVA COMO UMA PESSOA REAL:
- Natural, sem clichês ("Perfeito!", "Ótima escolha!", "Entendo...")
- Conciso (WhatsApp, não email)
- Máximo 1 emoji por mensagem se for relevante
- Varie as respostas (evite repetições)

EXEMPLO CORRETO:
User: "Isso é confortável?"
Você: "Sim, o material é leve e respirável. Perfeito pra dias quentes."

EXEMPLO ERRADO (NÃO FAÇA):
❌ User: "Isso é confortável?"
❌ Você: "O almoço do produto é confortável" (INVENTOU "almoço")
❌ Você: "Tem 100% algodão" (se não está na descrição)
❌ Você: "É o modelo Premium" (se não está na descrição)

LEMBRE-SE: Você só conhece as 5 informações acima. Nada mais existe para você.
`;

  const context = `
Produto: ${productName}
Descrição: ${productDescription || 'Descrição não informada'}
Preço: ${productPrice ? `R$${productPrice}` : 'Preço não informado'}
Categoria: ${productCategory}
Subcategoria: ${productSubcategory || '—'}
`;

  console.log(`[ProductResponse] Gerando resposta para: ${productName}`);
  console.log(`[ProductResponse] Mensagem do usuário: "${userMessage}"`);

  try {
    const aiResponse = await generateReply({
      system: systemPrompt,
      user: userMessage,
      context,
    });

    console.log(`[ProductResponse] Resposta IA: "${aiResponse.text}"`);

    if (isValidResponse(aiResponse.text)) {
      return aiResponse.text;
    }

    // Resposta inválida (vazia ou muito curta)
    console.warn(`[ProductResponse] Resposta inválida (${aiResponse.text.length} chars)`);
    return '';
  } catch (err) {
    console.error('[ProductResponse] Erro ao gerar resposta:', err);
    throw err;
  }
}

/*
  Gera resposta sobre pergunta contextual (categoria/subcategoria)
  Menos rigoroso que produto específico, mas ainda mantém regras
  
  CHATBOT 2.0: Poderia ser paramétrico com diferentes estilos de prompt.
*/
export async function generateContextualResponse(
  params: {
    userMessage: string;
    lastCategory?: string;
    lastSubcategory?: string;
    companyName: string;
  }
): Promise<string> {
  const { userMessage, lastCategory, lastSubcategory, companyName } = params;

  let contextMessage = '';
  if (lastSubcategory && lastCategory) {
    contextMessage = `O usuário está perguntando sobre a subcategoria "${lastSubcategory}" dentro de "${lastCategory}".`;
  } else if (lastCategory) {
    contextMessage = `O usuário está perguntando sobre a categoria "${lastCategory}".`;
  }

  const systemPrompt = `
Você é um atendente de WhatsApp da loja ${companyName}.
Seus valores:
- Educado e amigável, mas natural
- Responde com poucas linhas (WhatsApp)
- Nunca invente informações
- Se não sabe, diz claramente

CONTEXTO:
${contextMessage}

Responda naturalmente à pergunta do usuário.
`;

  console.log(
    `[ContextualResponse] Gerando para categoria: ${lastCategory}, subcategoria: ${lastSubcategory}`
  );

  try {
    const aiResponse = await generateReply({
      system: systemPrompt,
      user: userMessage,
      context: contextMessage,
    });

    if (isValidResponse(aiResponse.text)) {
      return aiResponse.text;
    }

    return '';
  } catch (err) {
    console.error('[ContextualResponse] Erro:', err);
    throw err;
  }
}
