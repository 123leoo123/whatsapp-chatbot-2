import { Request, Response } from 'express';
import { sendTextMessage } from '../services/whatsapp.service';
import { Company } from '../models/company';
import { Product } from '../models/product';
import {
  getLastCategory,
  setLastCategory,
  getLastSubcategory,
  setLastSubcategory,
  getLastProduct,
  setLastProduct,
  isHandedOff,
  setHandOff,
} from '../services/session.service';
import {
  mountCategoryResponse,
  mountProductListResponse,
  mountNotFoundResponse,
} from '../services/response.helper';
import { interpretIntent } from '../services/ai-intent-interpreter.service';
import {
  generateProductResponse,
  generateContextualResponse,
} from '../services/product-response.service';
import { normalizeText, findNormalizedMatch } from '../utils/normalize';
import { findClosestMatch } from '../utils/fuzzy-match';

async function listCategories(companyId: any) {
  const categories = await Product.distinct('category', { companyId, available: true });
  return (categories || []).filter(Boolean);
}

function matchItem(query: string, items: string[]): string | null {
  if (!query) return null;
  const normalized = normalizeText(query);
  const exact = findNormalizedMatch(normalized, items);
  if (exact) return exact;
  const fuzzy = findClosestMatch(normalized, items, 60);
  return fuzzy.match || null;
}

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

  // 1) If handed off, ignore AI and remind human is in progress
  if (isHandedOff(from)) {
    await sendTextMessage(from, 'Um atendente humano está em andamento. Aguarde contato.');
    return res.status(200).json({ received: true });
  }

  // QUICK GREETING HANDLER: if user greets, respond with greeting + categories
  try {
    const normalized = normalizeText(text || '');
    const tokens = (normalized || '').split(/\s+/).filter(Boolean);
    const GREETINGS = ['oi', 'ola', 'olá', 'oie', 'ei', 'eai', 'e aí', 'bom dia', 'boa tarde', 'boa noite', 'hello', 'hi', 'hey'];
    const isGreeting = tokens.some(t => GREETINGS.includes(t));
    if (isGreeting) {
      const categories = await Product.distinct('category', { companyId: company._id, available: true });
      const visible = (categories || []).filter(Boolean);
      if (!visible.length) {
        await sendTextMessage(from, 'Olá! No momento não temos produtos cadastrados.');
        return res.status(200).json({ received: true });
      }
      const list = visible.map(c => `• ${c}`).join('\n');
      await sendTextMessage(from, `Olá! 👋 Temos produtos nas seguintes categorias:\n${list}\n\nQual você procura?`);
      return res.status(200).json({ received: true });
    }
  } catch (err) {
    console.warn('[WebhookController] Greeting handler error', err);
  }

  // 2) Call AI interpreter
  console.log('[WebhookController] Message received:', { from, text, handedOff: isHandedOff(from) });
  
  const aiResult = await interpretIntent({
    text,
    session: {
      lastCategory: getLastCategory(from) || null,
      lastSubcategory: getLastSubcategory(from) || null,
      lastProduct: getLastProduct(from) || null,
    },
  });

  console.log('[WebhookController] AI Result:', { 
    intent: aiResult.intent, 
    confidence: aiResult.confidence,
    category: aiResult.category,
    product: aiResult.product
  });

  const MIN_CONFIDENCE = 0.6;
  let intent = aiResult.intent;

  // If LOW_CONFIDENCE (< 0.6), try fuzzy match with categories before rejecting
  if (!aiResult || typeof aiResult.confidence !== 'number' || aiResult.confidence < MIN_CONFIDENCE) {
    console.log('[WebhookController] Low confidence detected, attempting fuzzy match with categories...');
    const categories = await Product.distinct('category', { companyId: company._id, available: true });
    const visibleCategories = (categories || []).filter(Boolean);
    const fuzzyMatch = matchItem(text, visibleCategories);

    if (fuzzyMatch) {
      console.log('[WebhookController] Fuzzy match successful:', fuzzyMatch);
      intent = 'VIEW_CATEGORY';
      aiResult.intent = 'VIEW_CATEGORY';
      aiResult.category = fuzzyMatch;
      aiResult.confidence = 0.75; // Bump confidence for matched category
    } else {
      console.warn('[WebhookController] Low confidence and no fuzzy match found, returning NOT_FOUND');
      await sendTextMessage(from, mountNotFoundResponse());
      return res.status(200).json({ received: true });
    }
  }
  console.log('[WebhookController] Processing intent:', intent);
  console.log('[WebhookController] Processing intent:', intent);

  try {
    switch (intent) {
      case 'LIST_CATEGORIES': {
        const categories = await Product.distinct('category', { companyId: company._id, available: true });
        const visible = (categories || []).filter(Boolean);
        if (!visible.length) {
          await sendTextMessage(from, 'No momento não temos produtos cadastrados.');
          return res.status(200).json({ received: true });
        }
        const list = visible.map(c => `• ${c}`).join('\n');
        await sendTextMessage(from, `📦 Temos produtos nas seguintes categorias:\n${list}\n\nQual você procura?`);
        return res.status(200).json({ received: true });
      }

      case 'VIEW_CATEGORY': {
        const categoryRaw = (aiResult.category || '').trim();
        if (!categoryRaw) {
          await sendTextMessage(from, mountNotFoundResponse());
          return res.status(200).json({ received: true });
        }

        const categories = await Product.distinct('category', { companyId: company._id, available: true });
        const matched = matchItem(categoryRaw, (categories || []).filter(Boolean));
        if (!matched) {
          await sendTextMessage(from, mountNotFoundResponse());
          return res.status(200).json({ received: true });
        }

        setLastCategory(from, matched);

        const subs = await Product.distinct('subcategory', { companyId: company._id, category: matched, available: true });
        const visibleSubs = (subs || []).filter(Boolean);

        if (!visibleSubs.length) {
          const products = await Product.find({ companyId: company._id, category: matched, available: true });
          if (!products.length) {
            await sendTextMessage(from, mountNotFoundResponse());
            return res.status(200).json({ received: true });
          }
          setLastProduct(from, products[0]._id.toString());
          await sendTextMessage(from, mountProductListResponse(products.map((p: any) => ({ name: p.name, price: p.price }))));
          return res.status(200).json({ received: true });
        }

        await sendTextMessage(from, mountCategoryResponse(matched, visibleSubs));
        return res.status(200).json({ received: true });
      }

      case 'VIEW_SUBCATEGORY': {
        const categoryRaw = (aiResult.category || getLastCategory(from) || '').trim();
        const subRaw = (aiResult.subcategory || '').trim();
        if (!categoryRaw || !subRaw) {
          await sendTextMessage(from, mountNotFoundResponse());
          return res.status(200).json({ received: true });
        }

        const categories = await Product.distinct('category', { companyId: company._id, available: true });
        const matchedCategory = matchItem(categoryRaw, (categories || []).filter(Boolean));
        if (!matchedCategory) {
          await sendTextMessage(from, mountNotFoundResponse());
          return res.status(200).json({ received: true });
        }

        const subs = await Product.distinct('subcategory', { companyId: company._id, category: matchedCategory, available: true });
        const visibleSubs = (subs || []).filter(Boolean);
        const targetSub = matchItem(subRaw, visibleSubs);
        if (!targetSub) {
          await sendTextMessage(from, mountNotFoundResponse());
          return res.status(200).json({ received: true });
        }

        setLastCategory(from, matchedCategory);
        setLastSubcategory(from, targetSub);
        const products = await Product.find({ companyId: company._id, category: matchedCategory, subcategory: targetSub, available: true });
        if (!products.length) {
          await sendTextMessage(from, mountNotFoundResponse());
          return res.status(200).json({ received: true });
        }
        setLastProduct(from, products[0]._id.toString());
        await sendTextMessage(from, mountProductListResponse(products.map((p: any) => ({ name: p.name, price: p.price }))));
        return res.status(200).json({ received: true });
      }

      case 'VIEW_PRODUCT': {
        const productRaw = (aiResult.product || '').trim();
        if (!productRaw && !getLastProduct(from)) {
          await sendTextMessage(from, mountNotFoundResponse());
          return res.status(200).json({ received: true });
        }

        let productDoc: any = null;
        if (productRaw) {
          try {
            productDoc = await Product.findOne({ companyId: company._id, name: { $regex: productRaw, $options: 'i' }, available: true }).collation({ locale: 'pt', strength: 1 });
          } catch (err) {
            console.warn('[Webhook] Collation search failed for product name');
          }
          if (!productDoc) {
            const candidates = await Product.find({ companyId: company._id, available: true }).limit(200);
            const names = candidates.map((p: any) => p.name || '');
            const fuzzy = findClosestMatch(productRaw, names, 60);
            if (fuzzy.match) productDoc = candidates.find((p: any) => p.name === fuzzy.match) || null;
          }
        } else {
          const lastId = getLastProduct(from);
          if (lastId) productDoc = await Product.findById(lastId);
        }

        if (!productDoc) {
          await sendTextMessage(from, mountNotFoundResponse());
          return res.status(200).json({ received: true });
        }

        setLastProduct(from, productDoc._id.toString());

        const aiResponse = await generateProductResponse({
          productName: productDoc.name,
          productDescription: productDoc.description,
          productPrice: productDoc.price,
          productCategory: productDoc.category,
          productSubcategory: productDoc.subcategory,
          userMessage: text,
          companyName: company.name,
        });

        if (aiResponse) await sendTextMessage(from, aiResponse);
        else await sendTextMessage(from, mountNotFoundResponse());

        return res.status(200).json({ received: true });
      }

      case 'ASK_PRODUCT_ATTRIBUTE': {
        const productRaw = (aiResult.product || '').trim();
        let productDoc: any = null;
        if (productRaw) productDoc = await Product.findOne({ companyId: company._id, name: { $regex: productRaw, $options: 'i' } }).collation({ locale: 'pt', strength: 1 });
        if (!productDoc) {
          const lastId = getLastProduct(from);
          if (lastId) productDoc = await Product.findById(lastId);
        }
        if (!productDoc) {
          await sendTextMessage(from, mountNotFoundResponse());
          return res.status(200).json({ received: true });
        }

        const aiResponse = await generateProductResponse({
          productName: productDoc.name,
          productDescription: productDoc.description,
          productPrice: productDoc.price,
          productCategory: productDoc.category,
          productSubcategory: productDoc.subcategory,
          userMessage: text,
          companyName: company.name,
        });

        if (aiResponse) await sendTextMessage(from, aiResponse);
        else await sendTextMessage(from, mountNotFoundResponse());

        return res.status(200).json({ received: true });
      }

      case 'LIST_PRODUCTS': {
        const categoryRaw = (aiResult.category || getLastCategory(from) || '').trim();
        const subRaw = (aiResult.subcategory || getLastSubcategory(from) || '').trim();
        if (!categoryRaw && !subRaw) {
          await sendTextMessage(from, mountNotFoundResponse());
          return res.status(200).json({ received: true });
        }

        let matchedCategory: string | null = null;
        if (categoryRaw) {
          const cats = await Product.distinct('category', { companyId: company._id, available: true });
          matchedCategory = matchItem(categoryRaw, (cats || []).filter(Boolean));
        } else matchedCategory = getLastCategory(from) || null;

        if (!matchedCategory) {
          await sendTextMessage(from, mountNotFoundResponse());
          return res.status(200).json({ received: true });
        }

        let matchedSub: string | null = null;
        if (subRaw) {
          const subs = await Product.distinct('subcategory', { companyId: company._id, category: matchedCategory, available: true });
          matchedSub = matchItem(subRaw, (subs || []).filter(Boolean));
        }

        const query: any = { companyId: company._id, category: matchedCategory, available: true };
        if (matchedSub) query.subcategory = matchedSub;

        const products = await Product.find(query).limit(100);
        if (!products.length) {
          await sendTextMessage(from, mountNotFoundResponse());
          return res.status(200).json({ received: true });
        }

        setLastCategory(from, matchedCategory);
        if (matchedSub) setLastSubcategory(from, matchedSub);
        setLastProduct(from, products[0]._id.toString());

        await sendTextMessage(from, mountProductListResponse(products.map((p: any) => ({ name: p.name, price: p.price }))));
        return res.status(200).json({ received: true });
      }

      case 'TALK_TO_HUMAN': {
        setHandOff(from);
        await sendTextMessage(from, '👤 Um atendente humano entrará em contato em breve.');
        return res.status(200).json({ received: true });
      }

      case 'UNKNOWN':
      default: {
        await sendTextMessage(from, mountNotFoundResponse());
        return res.status(200).json({ received: true });
      }
    }
  } catch (err) {
    console.error('[WebhookController] Error processing intent:', err);
    await sendTextMessage(from, 'Tive um problema técnico 😕\nQuer falar com um atendente?');
    return res.status(200).json({ received: true });
  }
};

// Chat-first flow: no legacy fallback handler — AI decides intent and backend executes.
