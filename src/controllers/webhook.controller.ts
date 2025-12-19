import { Request, Response } from 'express';
import { sendTextMessage } from '../services/whatsapp.service';
import { detectIntent } from '../services/intent.services';
import { generateReply } from '../services/ai.service';
import { Company } from '../models/company';
import { Product } from '../models/product';
import { normalizeText, findNormalizedMatch } from '../utils/normalize';
import { findClosestMatch } from '../utils/fuzzy-match';
import {
  setLastProduct,
  getLastProduct,
  setLastCategory,
  getLastCategory,
  setLastSubcategory,
  getLastSubcategory,
  isUserGreeted,
  markUserAsGreeted,
} from '../services/session.service';
import {
  mountCategoryResponse,
  mountProductListResponse,
  mountNotFoundResponse,
} from '../services/response.helper';

/* =====================================================
   WEBHOOK VERIFY
===================================================== */
export const verifyWebhook = (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
};

/* =====================================================
   WEBHOOK EVENT
===================================================== */
export const handleWebhookEvent = async (req: Request, res: Response) => {
  const value = req.body?.entry?.[0]?.changes?.[0]?.value;
  if (!value) return res.status(200).json({ received: true });

  const phoneNumberId = value?.metadata?.phone_number_id;
  if (!phoneNumberId) return res.status(200).json({ received: true });

  const company = await Company.findOne({ whatsappPhoneNumberId: phoneNumberId });
  if (!company) return res.status(200).json({ received: true });

  const message = value?.messages?.[0];
  if (!message?.text) return res.status(200).json({ received: true });

  const from = message.from;
  const text = message.text.body.trim();

  // anti-loop
  if (from === phoneNumberId) return res.status(200).json({ received: true });

  // 🧠 FORÇA GREETING NA PRIMEIRA MENSAGEM (apenas uma vez)
  if (!isUserGreeted(from)) {
    markUserAsGreeted(from);
    // Primeira mensagem: sempre GREETING
    await sendTextMessage(
      from,
      `Olá! 👋 Aqui é o atendimento da *${company.name}*.

Digite:
1️⃣ Ver produtos
2️⃣ Endereço
3️⃣ Falar com atendente`
    );
    return res.status(200).json({ received: true });
  }

  const intentResult = detectIntent(text);

  switch (intentResult.intent) {
    /* =====================================================
       GREETING
    ===================================================== */
    case 'GREETING':
      // GREETING já é forçado no início, mas mantém para casos de reativação
      await sendTextMessage(
        from,
        `Olá! 👋 Aqui é o atendimento da *${company.name}*.

Digite:
1️⃣ Ver produtos
2️⃣ Endereço
3️⃣ Falar com atendente`
      );
      break;

    /* =====================================================
       LIST PRODUCTS → MOSTRA CATEGORIAS
       (COM PROTEÇÃO DEFENSIVA)
    ===================================================== */
    case 'LIST_PRODUCTS': {
      const categories = await Product.distinct('category', {
        companyId: company._id,
        available: true,
      });

      // 🛡️ PROTEÇÃO DEFENSIVA
      if (!categories.length) {
        const anyProduct = await Product.findOne({
          companyId: company._id,
          available: true,
        });

        if (!anyProduct) {
          await sendTextMessage(
            from,
            'No momento não temos produtos cadastrados 😕'
          );
          break;
        }

        await sendTextMessage(
          from,
          'Estamos organizando nossos produtos no momento 😊\nPode me dizer o que você procura?'
        );
        break;
      }

      const list = categories.map(c => `• ${c}`).join('\n');

      await sendTextMessage(
        from,
        `📦 Temos produtos nas seguintes categorias:\n${list}\n\nQual você procura?`
      );
      break;
    }

    /* =====================================================
       PRODUCT QUERY
       LÓGICA: categoria → subcategoria (com lastCategory) → produto
    ===================================================== */
    case 'PRODUCT_QUERY': {
      const query = (intentResult.query ?? '').trim();

      // 🔥 PRIORIDADE 1️⃣: Tenta CATEGORIA sempre (ignora lastCategory se for categoria nova)
      let categoryMatch: any = null;
      try {
        categoryMatch = await Product.findOne({
          companyId: company._id,
          category: query,
        }).collation({ locale: 'pt', strength: 1 });
      } catch (err) {
        console.warn('Collation failed for category');
      }

      // Fallback: normalized + fuzzy
      if (!categoryMatch) {
        const categories = await Product.distinct('category', {
          companyId: company._id,
          available: true,
        });
        const matched = findNormalizedMatch(query, categories);
        if (matched) {
          categoryMatch = { category: matched } as any;
        } else {
          const fuzzyResult = findClosestMatch(query, categories.filter(Boolean), 60);
          if (fuzzyResult.match) categoryMatch = { category: fuzzyResult.match } as any;
        }
      }

      // Se encontrou categoria, lista subcategorias
      if (categoryMatch) {
        setLastCategory(from, categoryMatch.category);

        const subcategories = await Product.distinct('subcategory', {
          companyId: company._id,
          category: categoryMatch.category,
          available: true,
        });

        const resp = mountCategoryResponse(categoryMatch.category, subcategories);
        await sendTextMessage(from, resp);
        break;
      }

      // 🔥 PRIORIDADE 2️⃣: Se há lastCategory, tenta subcategoria
      const lastCategory = getLastCategory(from);
      if (lastCategory) {
        const subs = await Product.distinct('subcategory', {
          companyId: company._id,
          category: lastCategory,
          available: true,
        });

        console.log(`[DEBUG] Buscando subcategoria "${query}" em ${lastCategory}. Subcategorias disponíveis:`, subs);

        let subMatch: any = null;

        // Tenta collation
        try {
          subMatch = await Product.findOne({
            companyId: company._id,
            category: lastCategory,
            subcategory: query,
          }).collation({ locale: 'pt', strength: 1 });
        } catch (err) {
          console.warn('Collation failed for subcategory');
        }

        // Fallback: fuzzy matching
        if (!subMatch) {
          const fuzzyResult = findClosestMatch(query, subs.filter(Boolean), 50);
          if (fuzzyResult.match) subMatch = { subcategory: fuzzyResult.match } as any;
        }

        // Fallback: normalized match
        if (!subMatch) {
          const matched = findNormalizedMatch(query, subs);
          if (matched) subMatch = { subcategory: matched } as any;
        }

        // Se encontrou subcategoria, lista produtos
        if (subMatch) {
          console.log(`[DEBUG] Subcategoria encontrada: ${subMatch.subcategory}`);
          setLastSubcategory(from, subMatch.subcategory!);

          const products = await Product.find({
            companyId: company._id,
            category: lastCategory,
            subcategory: subMatch.subcategory,
            available: true,
          });

          if (!products.length) {
            await sendTextMessage(from, mountNotFoundResponse());
            break;
          }

          setLastProduct(from, products[0]._id.toString());
          const response = mountProductListResponse(products as any);
          await sendTextMessage(from, response);
          break;
        }
      }

      // 3️⃣ Tentativa: nome de produto (regex + collation; fallback para normalização local + fuzzy)
      let product: any = null;
      try {
        product = await Product.findOne({
          companyId: company._id,
          name: { $regex: query, $options: 'i' },
        }).collation({ locale: 'pt', strength: 1 });
      } catch (err) {
        console.warn('Product search with collation failed, fallback to normalized search', err);
      }

      if (!product) {
        const candidates = await Product.find({ companyId: company._id, available: true }).limit(200);
        const productNames = candidates.map((p: any) => p.name || '');

        const fuzzyResult = findClosestMatch(query, productNames, 60);
        if (fuzzyResult.match) {
          product = candidates.find((p: any) => p.name === fuzzyResult.match) as any;
        } else {
          const target = normalizeText(query);
          product = candidates.find((p: any) => normalizeText(p.name || '') === target) as any
            || candidates.find((p: any) => normalizeText(p.name || '').includes(target)) as any;
        }
      }

      if (!product) {
        const lastProductId = getLastProduct(from);
        if (lastProductId) product = await Product.findById(lastProductId);
      }

      if (!product) {
        await sendTextMessage(from, 'Não consegui identificar o produto 😕\nVocê pode escolher uma categoria ou subcategoria.');
        break;
      }

      setLastProduct(from, product._id.toString());

      /* =====================================================
         🧠 IA — APENAS HUMANIZA
      ===================================================== */
      try {
        const systemPrompt = `
VOCÊ É UM ATENDENTE DE LOJA REAL. REGRA FUNDAMENTAL: **NUNCA INVENTE INFORMAÇÕES**.

⚠️ PROIBIÇÕES ABSOLUTAS - VIOLE POR SUA CONTA E RISCO:
1. NÃO INVENTE PALAVRAS OU CONCEITOS (ex: "almoço", "ingredientes", "modelo X")
2. NÃO USE INFORMAÇÕES QUE NÃO ESTÃO NA SEÇÃO "CONTEXTO" ABAIXO
3. NÃO DESCREVA CARACTERÍSTICAS NÃO MENCIONADAS
4. SE NÃO SABE, DIGA: "Não tenho essa informação"
5. NÃO INICIE COM SAUDAÇÕES - VÁ DIRETO AO ASSUNTO

DADOS DISPONÍVEIS (use APENAS esses):
- Nome: ${product.name}
- Descrição: ${product.description || '(não informada)'}
- Preço: ${product.price ? `R$${product.price}` : '(não informado)'}
- Categoria: ${product.category}
- Subcategoria: ${product.subcategory || '(não informada)'}

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
Produto: ${product.name}
Descrição: ${product.description || 'Descrição não informada'}
Preço: ${product.price ? `R$${product.price}` : 'Preço não informado'}
Categoria: ${product.category}
Subcategoria: ${product.subcategory || '—'}
`;

        // 🔍 DEBUG: Log para entender respostas estranhas
        console.log(`[DEBUG] Produto encontrado:`, {
          id: product._id,
          name: product.name,
          description: product.description,
          query: query,
          userMessage: text,
        });

        const aiResponse = await generateReply({ system: systemPrompt, user: text, context });

        // 🔍 DEBUG: Log da resposta da IA
        console.log(`[DEBUG] Resposta IA:`, aiResponse);

        if (!aiResponse.text || aiResponse.text.length < 5) {
          await sendTextMessage(from, 'Não tenho essa informação com precisão agora 😕\nQuer que eu chame um atendente humano?');
          break;
        }

        await sendTextMessage(from, aiResponse.text);
        break;
      } catch (err) {
        console.error('Erro IA:', err);
        await sendTextMessage(from, 'Tive dificuldade em responder isso agora 😕\nQuer que eu chame um atendente humano?');
        break;
      }
    }

    /* =====================================================
       ADDRESS
    ===================================================== */
    case 'ADDRESS':
      await sendTextMessage(from, `📍 Endereço:\n${company.address}`);
      break;

    /* =====================================================
       BUSINESS HOURS
    ===================================================== */
    case 'BUSINESS_HOURS':
      await sendTextMessage(from, `⏰ Horário:\n${company.businessHours}`);
      break;

    /* =====================================================
       PAYMENT
    ===================================================== */
    case 'PAYMENT':
      await sendTextMessage(
        from,
        `💳 Formas de pagamento:\n${company.paymentMethods.join(', ')}`
      );
      break;

    /* =====================================================
       HUMAN
    ===================================================== */
    case 'HUMAN':
      await sendTextMessage(
        from,
        '👤 Um atendente humano entrará em contato em breve.'
      );
      break;

    /* =====================================================
       FALLBACK INTELIGENTE
       Quando nenhum intent é detectado, mas há contexto anterior
    ===================================================== */
    default:
      const lastProductId = getLastProduct(from);
      const lastSubcategory = getLastSubcategory(from);
      const lastCategory = getLastCategory(from);

      // 🎯 DETECÇÃO: É uma pergunta SOBRE o produto anterior?
      // Só usa lastProduct se parecer ser pergunta sobre aquele produto
      const queryNormalized = normalizeText(text);
      const questionMarks = /\?/.test(text.trim());
      const questionKeywords = ['qual', 'como', 'por que', 'porque', 'pq', 'quando', 'onde', 'confortável', 'confortavel', 'material', 'tamanho', 'cor', 'tem', 'custa', 'preço', 'valor'];
      const pronouns = ['esse', 'essa', 'isso', 'ele', 'ela', 'este', 'esta', 'aquele', 'aquela', 'tá', 'ta', 'né', 'ne'];
      
      const isQuestionAboutProduct = questionMarks 
        || questionKeywords.some(kw => queryNormalized.includes(kw))
        || pronouns.some(p => queryNormalized.includes(p));

      // 🎯 PRIORIDADE: Se há lastProduct E parece pergunta SOBRE ele, usa como contexto
      // (usuário já escolheu um produto e está perguntando sobre ele)
      if (lastProductId && isQuestionAboutProduct) {
        try {
          const product = await Product.findById(lastProductId);
          if (product) {
            console.log(`[DEBUG] Fallback com lastProduct: ${product.name}. User message: "${text}"`);

            const contextMessage = `
Produto: ${product.name}
Descrição: ${product.description || 'Descrição não informada'}
Preço: ${product.price ? `R$${product.price}` : 'Preço não informado'}
Categoria: ${product.category}
Subcategoria: ${product.subcategory || '—'}

O usuário está fazendo uma pergunta sobre este produto.
`;

            const systemPrompt = `
⚠️ REGRA FUNDAMENTAL: **NUNCA INVENTE INFORMAÇÕES**.

DADOS DISPONÍVEIS (use APENAS esses):
- Nome: ${product.name}
- Descrição: ${product.description || '(não informada)'}
- Preço: ${product.price ? `R$${product.price}` : '(não informado)'}
- Categoria: ${product.category}
- Subcategoria: ${product.subcategory || '(não informada)'}

O usuário já escolheu este produto e está perguntando sobre ele.

INSTRUÇÕES:
1. Responda DIRETAMENTE a pergunta (sem saudações ou "Olá")
2. Use APENAS os 5 dados acima
3. Se não sabe, diga: "Não tenho essa informação"
4. Máximo 1 emoji se relevante
5. Variedade: não repita as mesmas frases
6. Evite clichês: "Perfeito!", "Ótima escolha!"

LEMBRE: Você conhece APENAS essas 5 informações. Nada mais existe.
`;

            const aiResponse = await generateReply({
              system: systemPrompt,
              user: text,
              context: contextMessage,
            });

            console.log(`[DEBUG] IA response:`, aiResponse);

            if (aiResponse.text && aiResponse.text.length > 2) {
              await sendTextMessage(from, aiResponse.text);
              return res.status(200).json({ received: true });
            }
          }
        } catch (err) {
          console.error('Erro no fallback com lastProduct:', err);
        }
      }

      // 🎯 FALLBACK 2: Se há lastSubcategory/lastCategory, verifica se é pergunta contextual
      if (lastSubcategory || lastCategory) {
        const contextualKeywords = [
          'caro', 'barato', 'custa', 'preço', 'valor', 'preco',
          'tem', 'há', 'outra', 'outro', 'diferente', 'alternativa',
          'qual', 'como', 'de que', 'feito', 'material', 'tamanho',
          'cor', 'disponível', 'estoque', 'pronta entrega', 'apressa',
          'confortável', 'confortavel', 'conforto', 'comodo', 'fora', 'melhor', 'mais', 'menos'
        ];

        const pronouns = ['essa','esse','ele','ela','isso','isto','aquele','aquela','aquilo','esta','este','aqueles','aquelas','ta','tá','né','ne'];

        const textNormalized = normalizeText(text);
        const containsKeyword = contextualKeywords.some(kw => textNormalized.includes(kw));
        const containsPronoun = pronouns.some(p => textNormalized.includes(p));
        const isExplicitQuestion = /\?$/.test(text.trim()) || /(^|\s)(por que|porque|como|quando|onde|qual|que|quer|gostaria|gostou|possui|tem)(\s|$)/i.test(text);

        const treatAsContext = containsKeyword || containsPronoun || isExplicitQuestion;

        if (treatAsContext) {
          try {
            let contextMessage = '';

            if (lastSubcategory && lastCategory) {
              contextMessage = `O usuário está perguntando sobre a subcategoria "${lastSubcategory}" dentro de "${lastCategory}".`;
            } else if (lastCategory) {
              contextMessage = `O usuário está perguntando sobre a categoria "${lastCategory}".`;
            }

            const systemPrompt = `
Você é um atendente de WhatsApp da loja ${company.name}.
Seus valores:
- Educado e amigável, mas natural
- Responde com poucas linhas (WhatsApp)
- Nunca invente informações
- Se não sabe, diz claramente

CONTEXTO:
${contextMessage}

Responda naturalmente à pergunta do usuário.
`;

            const aiResponse = await generateReply({
              system: systemPrompt,
              user: text,
              context: contextMessage,
            });

            if (aiResponse.text && aiResponse.text.length > 2) {
              await sendTextMessage(from, aiResponse.text);
              return res.status(200).json({ received: true });
            }
          } catch (err) {
            console.error('Erro no fallback com categoria/subcategoria:', err);
          }
        }
      }

      // Fallback final: sem contexto ou contexto não conseguiu responder
      await sendTextMessage(
        from,
        'Não entendi bem isso 🤔\nTente escolher uma categoria ou diga "ver produtos" para listar nossas opções.'
      );
      break;
  }

  return res.status(200).json({ received: true });
};
