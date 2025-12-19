/*
  AI Intent Interpreter Service

  Responsabilidade:
  - Receber a mensagem do usuário + estado mínimo de sessão
  - Chamar a camada de IA (via `generateReply`) com um prompt RÍGIDO
    que obriga a responder APENAS JSON
  - Retornar o JSON parseado (não texto livre)

  Regras importantes (implementadas no prompt):
  - Responda SOMENTE com JSON válido
  - Nunca inclua texto explicativo
  - Use apenas os campos permitidos (intent, target, attribute, confidence)
  - Retorne intent "UNKNOWN" quando estiver inseguro

  Papel no Chatbot 2.0:
  - Esta camada interpreta intenção/contexto e retorna um contrato
    JSON que o `intent-validator` validará. A IA nunca executa ações,
    nem acessa banco ou envia mensagens.

  Nota: A chamada à IA é encapsulada aqui de forma a facilitar a
  troca do provedor (Ollama → Cloud) no futuro.
*/

import { generateReply } from './ai.service';

export type ChatIntent =
  | 'VIEW_CATEGORY'
  | 'VIEW_SUBCATEGORY'
  | 'VIEW_PRODUCT'
  | 'ASK_PRODUCT_ATTRIBUTE'
  | 'LIST_CATEGORIES'
  | 'LIST_PRODUCTS'
  | 'TALK_TO_HUMAN'
  | 'UNKNOWN';

export interface ChatIntentResult {
  intent: ChatIntent;
  category?: string | null;
  subcategory?: string | null;
  product?: string | null;
  attribute?: string | null;
  confidence: number;
}

export type InterpretParams = {
  text: string;
  session?: {
    lastCategory?: string | null;
    lastSubcategory?: string | null;
    lastProduct?: string | null;
  };
};

export async function interpretIntent(params: InterpretParams): Promise<ChatIntentResult> {
  const { text, session } = params;

  const sessionContext = session
    ? `\nSESSION:\n- lastCategory: ${session.lastCategory || '(none)'}\n- lastSubcategory: ${session.lastSubcategory || '(none)'}\n- lastProduct: ${session.lastProduct ? '(exists)' : '(none)'}\n`
    : '';

  const systemPrompt = `You are an intent interpreter for an e-commerce chatbot. Your ONLY job is to analyze the user's message and return a JSON object.

CRITICAL RULES:
1. Respond ONLY with valid JSON (no markdown, no text before/after)
2. Never invent data. If unsure, return UNKNOWN with confidence < 0.6
3. Always include all 5 fields: intent, category, subcategory, product, attribute, confidence
4. If user mentions ANY category name (clothing types: calça, jeans, camiseta, vestido, etc.), respond with VIEW_CATEGORY intent

JSON Schema:
{
  "intent": "VIEW_CATEGORY | VIEW_SUBCATEGORY | VIEW_PRODUCT | ASK_PRODUCT_ATTRIBUTE | LIST_CATEGORIES | LIST_PRODUCTS | TALK_TO_HUMAN | UNKNOWN",
  "category": null or string,
  "subcategory": null or string,
  "product": null or string,
  "attribute": null or string,
  "confidence": number between 0.0 and 1.0
}

INTENT DEFINITIONS WITH EXAMPLES:

1. LIST_CATEGORIES - User wants to see all product categories
   Examples: "show me categories", "what do you have?", "list products", "what categories?"
   Response: {"intent":"LIST_CATEGORIES","category":null,"subcategory":null,"product":null,"attribute":null,"confidence":0.95}

2. VIEW_CATEGORY - User specifies a category name (clothing types: calça, jeans, camiseta, vestido, sapato, etc.)
   Examples: "show me jeans", "calça", "i want to see dresses", "category: shoes"
   Response: {"intent":"VIEW_CATEGORY","category":"jeans","subcategory":null,"product":null,"attribute":null,"confidence":0.92}

3. VIEW_SUBCATEGORY - User specifies a subcategory (requires category context)
   Examples: "show me polo shirts", "i want cotton", "what about sizes?"
   Response: {"intent":"VIEW_SUBCATEGORY","category":"t-shirts","subcategory":"polo","product":null,"attribute":null,"confidence":0.88}

4. VIEW_PRODUCT - User wants to see/select a specific product
   Examples: "show me that red shirt", "tell me about this product", "product details"
   Response: {"intent":"VIEW_PRODUCT","category":null,"subcategory":null,"product":"red shirt","attribute":null,"confidence":0.85}

5. ASK_PRODUCT_ATTRIBUTE - User asks about specific product details
   Examples: "is it comfortable?", "what's the price?", "is it washable?", "what material?"
   Response: {"intent":"ASK_PRODUCT_ATTRIBUTE","category":null,"subcategory":null,"product":null,"attribute":"material","confidence":0.90}

6. LIST_PRODUCTS - User wants product list (generic or filtered)
   Examples: "show all products", "what products do you have?", "product list", "quero ver os produtos"
   Response: {"intent":"LIST_PRODUCTS","category":null,"subcategory":null,"product":null,"attribute":null,"confidence":0.91}

7. TALK_TO_HUMAN - User explicitly asks to speak with a human
   Examples: "i want to talk to someone", "connect me to a person", "speak with an agent", "call a human"
   Response: {"intent":"TALK_TO_HUMAN","category":null,"subcategory":null,"product":null,"attribute":null,"confidence":0.98}

8. UNKNOWN - User message is unclear or doesn't match any intent
   Examples: "asdjkasjd", "xyz123", message that makes no sense
   Response: {"intent":"UNKNOWN","category":null,"subcategory":null,"product":null,"attribute":null,"confidence":0.2}

GREETINGS (hi, hello, hey, oi, olá) should return UNKNOWN with low confidence (0.3), NOT TALK_TO_HUMAN.

SESSION CONTEXT:
${sessionContext}
If lastCategory exists, prioritize SUBCATEGORY intent.
If lastProduct exists, prioritize ASK_PRODUCT_ATTRIBUTE intent.

NOW RESPOND WITH JSON ONLY - NO MARKDOWN, NO TEXT.`;

  const userPrompt = `Message: "${text}"\nPlease respond with the exact JSON object.`;

  console.log('[AI Intent] calling LLM interpreter for message');
  console.log('[AI Intent] System prompt:', systemPrompt.slice(0, 200) + '...');
  console.log('[AI Intent] User prompt:', userPrompt);
  
  const ai = await generateReply({ system: systemPrompt, user: userPrompt, context: '' });

  const raw = (ai.text || '').trim();
  console.log('[AI Intent] Raw response from LLM (first 500 chars):', raw.slice(0, 500));
  
  try {
    if (!raw.startsWith('{') || !raw.endsWith('}')) {
      // Try to extract JSON from markdown code blocks (e.g. ```json {...} ```)
      const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        const extracted = jsonMatch[1].trim();
        if (extracted.startsWith('{') && extracted.endsWith('}')) {
          console.log('[AI Intent] Extracted JSON from markdown code block');
          const parsed = JSON.parse(extracted);
          const result: ChatIntentResult = {
            intent: parsed.intent as ChatIntent,
            category: parsed.category ?? null,
            subcategory: parsed.subcategory ?? null,
            product: parsed.product ?? null,
            attribute: parsed.attribute ?? null,
            confidence: parsed.confidence,
          };
          return result;
        }
      }
      throw new Error('Response is not pure JSON');
    }
    const parsed = JSON.parse(raw);

    // Basic validation
    if (!parsed.intent || typeof parsed.intent !== 'string') throw new Error('Missing intent');
    if (typeof parsed.confidence !== 'number') throw new Error('Missing confidence');

    const result: ChatIntentResult = {
      intent: parsed.intent as ChatIntent,
      category: parsed.category ?? null,
      subcategory: parsed.subcategory ?? null,
      product: parsed.product ?? null,
      attribute: parsed.attribute ?? null,
      confidence: parsed.confidence,
    };

    return result;
  } catch (err) {
    console.error('[AI Intent] interpreter parse/validation error', err, 'raw:', raw.slice(0, 200));
    return {
      intent: 'UNKNOWN',
      category: null,
      subcategory: null,
      product: null,
      attribute: null,
      confidence: 0,
    };
  }
}
