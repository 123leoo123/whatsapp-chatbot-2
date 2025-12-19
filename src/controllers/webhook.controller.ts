import { Request, Response } from 'express';
import { sendTextMessage } from '../services/whatsapp.service';
import { detectIntent } from '../services/intent.services';
import { generateReply } from '../services/ai.service';
import { Company } from '../models/company';
import { Product } from '../models/product';
import {
  setLastProduct,
  getLastProduct,
  setLastCategory,
  getLastCategory,
  setLastSubcategory,
  getLastSubcategory,
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

  const intentResult = detectIntent(text);

  switch (intentResult.intent) {
    /* =====================================================
       GREETING
    ===================================================== */
    case 'GREETING':
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
       (categoria → subcategoria → produto → IA)
    ===================================================== */
    case 'PRODUCT_QUERY': {
  const query = (intentResult.query ?? '').trim();

  // 1️⃣ Tentativa: texto é exatamente uma categoria? (usando collation para ignorar acentos)
  let categoryMatch = null;
  try {
    categoryMatch = await Product.findOne({
      companyId: company._id,
      category: query,
    }).collation({ locale: 'pt', strength: 1 });
  } catch (err) {
    // collation pode não estar disponível/ser suportada na configuração do MongoDB;
    // iremos usar fallback abaixo.
    console.warn('Collation failed, will fallback to normalized comparison', err);
  }

  // Fallback: busca por categorias normalizando localmente
  if (!categoryMatch) {
    const categories = await Product.distinct('category', {
      companyId: company._id,
      available: true,
    });
    const normalize = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    const matched = categories.find(c => normalize(c) === normalize(query));
    if (matched) {
      categoryMatch = { category: matched } as any;
    }
  }

  if (categoryMatch) {
    setLastCategory(from, categoryMatch.category);

    const subcategories = await Product.distinct('subcategory', {
      companyId: company._id,
      category: categoryMatch.category,
      available: true,
    });

    const response = mountCategoryResponse(categoryMatch.category, subcategories.filter(Boolean));
    await sendTextMessage(from, response);
    break;
  }

  // 2️⃣ Tentativa: texto é uma subcategoria (considerando lastCategory)
  const lastCategory = getLastCategory(from);
  if (lastCategory) {
    let subMatch: any = null;
    try {
      subMatch = await Product.findOne({
        companyId: company._id,
        category: lastCategory,
        subcategory: query,
      }).collation({ locale: 'pt', strength: 1 });
    } catch (err) {
      // fallback mais abaixo
    }

    if (!subMatch) {
      const subs = await Product.distinct('subcategory', {
        companyId: company._id,
        category: lastCategory,
        available: true,
      });
      const normalize = (s: string) =>
        s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

      const matched = subs.find(s => normalize(s) === normalize(query));
      if (matched) subMatch = { subcategory: matched } as any;
    }

    if (subMatch) {
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
      const response = mountProductListResponse(products);
      await sendTextMessage(from, response);
      break;
    }
  }

  // 3️⃣ Tentativa: nome de produto (regex + collation; fallback para normalização local)
  let product = null;
  try {
    product = await Product.findOne({
      companyId: company._id,
      name: { $regex: query, $options: 'i' },
    }).collation({ locale: 'pt', strength: 1 });
  } catch (err) {
    console.warn('Product search with collation failed, fallback to normalized search', err);
  }

  if (!product) {
    // fallback: buscar alguns produtos e comparar nomes normalizados
    const normalize = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    const candidates = await Product.find({
      companyId: company._id,
      available: true,
    }).limit(200);

    const target = normalize(query);
    product = candidates.find(p => normalize(p.name || '') === target) as any
      || candidates.find(p => normalize(p.name || '').includes(target)) as any;
  }

  if (!product) {
    const lastProductId = getLastProduct(from);
    if (lastProductId) {
      product = await Product.findById(lastProductId);
    }
  }

  if (!product) {
    await sendTextMessage(
      from,
      'Não consegui identificar o produto 😕\nVocê pode escolher uma categoria ou subcategoria.'
    );
    break;
  }

  setLastProduct(from, product._id.toString());

  /* =====================================================
     🧠 IA — APENAS HUMANIZA
  ===================================================== */
  try {
    const systemPrompt = `
Você é um vendedor real em WhatsApp. Sua meta: conversar naturalmente.

COMPORTAMENTO:
- Educado e amigável, mas nunca robô
- Respostas CONCISAS (WhatsApp não é email)
- VARIÁVEL: evita repetir as mesmas frases
- SINCERO: se não sabe, diz direto "não tenho essa info"
- Máximo 1 emoji por mensagem, só quando faz sentido real
- NUNCA use clichês: "Perfeito!", "Ótima escolha!", "Entendo..."

CONTEÚDO:
- Use APENAS as informações fornecidas
- Nunca invente especificações, preços ou disponibilidade
- Se falta contexto, admite isso naturalmente
- Foque em responder o que o cliente perguntou

TOM: Como você falaria em pessoa, mas pelo WhatsApp.
`;

    const context = `
Produto: ${product.name}
Descrição: ${product.description || 'Descrição não informada'}
Preço: ${product.price ? `R$${product.price}` : 'Preço não informado'}
Categoria: ${product.category}
Subcategoria: ${product.subcategory || '—'}
`;

    const aiResponse = await generateReply({
      system: systemPrompt,
      user: text,
      context,
    });

    if (!aiResponse.text || aiResponse.text.length < 5) {
      await sendTextMessage(
        from,
        'Não tenho essa informação com precisão agora 😕\nQuer que eu chame um atendente humano?'
      );
      break;
    }

    await sendTextMessage(from, aiResponse.text);
    break;
  } catch (err) {
    console.error('Erro IA:', err);
    await sendTextMessage(
      from,
      'Tive dificuldade em responder isso agora 😕\nQuer que eu chame um atendente humano?'
    );
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
  }

  return res.status(200).json({ received: true });
};
