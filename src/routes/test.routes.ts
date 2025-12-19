import { Router, Request, Response } from 'express';
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
  resetSession,
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

const router = Router();

interface TestMessage {
  userId: string;
  companyName: string;
  text: string;
}

interface TestResponse {
  success: boolean;
  intent?: string;
  confidence?: number;
  message?: string;
  error?: string;
  sessionState?: any;
}

const MIN_CONFIDENCE = 0.6;

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

function getSessionState(userId: string) {
  return {
    lastCategory: getLastCategory(userId),
    lastSubcategory: getLastSubcategory(userId),
    lastProduct: getLastProduct(userId),
    handedOff: isHandedOff(userId),
  };
}

// POST /test/simulate - simulate a message and see flow result
router.post('/test/simulate', async (req: Request, res: Response) => {
  try {
    const { userId, companyName, text } = req.body as TestMessage;

    if (!userId || !companyName || !text) {
      return res.status(400).json({
        success: false,
        error: 'Missing userId, companyName, or text',
      });
    }

    const company = await Company.findOne({ name: companyName });
    if (!company) {
      return res.status(404).json({
        success: false,
        error: `Company "${companyName}" not found`,
      });
    }

    console.log(`\n[TEST] User: ${userId}, Message: "${text}"`);

    // 1) Check if handed off
    if (isHandedOff(userId)) {
      console.log('[TEST] User handed off, skipping flow');
      return res.status(200).json({
        success: true,
        intent: 'TALK_TO_HUMAN',
        message: 'Um atendente humano está em andamento. Aguarde contato.',
        sessionState: getSessionState(userId),
      });
    }

    // 2) Call AI interpreter
    const aiResult = await interpretIntent({
      text,
      session: {
        lastCategory: getLastCategory(userId) || null,
        lastSubcategory: getLastSubcategory(userId) || null,
        lastProduct: getLastProduct(userId) || null,
      },
    });

    console.log(`[TEST] AI Result: intent=${aiResult.intent}, confidence=${aiResult.confidence}`);

    if (!aiResult || typeof aiResult.confidence !== 'number' || aiResult.confidence < MIN_CONFIDENCE) {
      console.log('[TEST] Confidence too low, returning NOT_FOUND');
      return res.status(200).json({
        success: true,
        intent: aiResult?.intent || 'UNKNOWN',
        confidence: aiResult?.confidence || 0,
        message: mountNotFoundResponse(),
        sessionState: getSessionState(userId),
      });
    }

    const intent = aiResult.intent;

    // 3) Execute intent
    let responseMessage = '';

    switch (intent) {
      case 'LIST_CATEGORIES': {
        const categories = await listCategories(company._id);
        if (!categories.length) {
          responseMessage = 'No momento não temos produtos cadastrados.';
          return res.status(200).json({
            success: true,
            intent,
            confidence: aiResult.confidence,
            message: responseMessage,
            sessionState: getSessionState(userId),
          });
        }
        const list = categories.map(c => `• ${c}`).join('\n');
        responseMessage = `📦 Temos produtos nas seguintes categorias:\n${list}\n\nQual você procura?`;
        return res.status(200).json({
          success: true,
          intent,
          confidence: aiResult.confidence,
          message: responseMessage,
          sessionState: getSessionState(userId),
        });
      }

      case 'VIEW_CATEGORY': {
        const categoryRaw = (aiResult.category || '').trim();
        if (!categoryRaw) {
          responseMessage = mountNotFoundResponse();
          return res.status(200).json({
            success: true,
            intent,
            confidence: aiResult.confidence,
            message: responseMessage,
            error: 'No category provided in AI result',
            sessionState: getSessionState(userId),
          });
        }

        const categories = await listCategories(company._id);
        const matched = matchItem(categoryRaw, categories);
        if (!matched) {
          responseMessage = mountNotFoundResponse();
          return res.status(200).json({
            success: true,
            intent,
            confidence: aiResult.confidence,
            message: responseMessage,
            error: `Category "${categoryRaw}" not found`,
            sessionState: getSessionState(userId),
          });
        }

        setLastCategory(userId, matched);

        const subs = await Product.distinct('subcategory', {
          companyId: company._id,
          category: matched,
          available: true,
        });
        const visibleSubs = (subs || []).filter(Boolean);

        if (!visibleSubs.length) {
          const products = await Product.find({ companyId: company._id, category: matched, available: true });
          if (!products.length) {
            responseMessage = mountNotFoundResponse();
            return res.status(200).json({
              success: true,
              intent,
              confidence: aiResult.confidence,
              message: responseMessage,
              error: 'No products found in category',
              sessionState: getSessionState(userId),
            });
          }
          setLastProduct(userId, products[0]._id.toString());
          responseMessage = mountProductListResponse(
            products.map((p: any) => ({ name: p.name, price: p.price }))
          );
          return res.status(200).json({
            success: true,
            intent,
            confidence: aiResult.confidence,
            message: responseMessage,
            sessionState: getSessionState(userId),
          });
        }

        responseMessage = mountCategoryResponse(matched, visibleSubs);
        return res.status(200).json({
          success: true,
          intent,
          confidence: aiResult.confidence,
          message: responseMessage,
          sessionState: getSessionState(userId),
        });
      }

      case 'VIEW_SUBCATEGORY': {
        const categoryRaw = (aiResult.category || getLastCategory(userId) || '').trim();
        const subRaw = (aiResult.subcategory || '').trim();
        if (!categoryRaw || !subRaw) {
          responseMessage = mountNotFoundResponse();
          return res.status(200).json({
            success: true,
            intent,
            confidence: aiResult.confidence,
            message: responseMessage,
            error: 'Missing category or subcategory',
            sessionState: getSessionState(userId),
          });
        }

        const categories = await listCategories(company._id);
        const matchedCategory = matchItem(categoryRaw, categories);
        if (!matchedCategory) {
          responseMessage = mountNotFoundResponse();
          return res.status(200).json({
            success: true,
            intent,
            confidence: aiResult.confidence,
            message: responseMessage,
            error: `Category not found: "${categoryRaw}"`,
            sessionState: getSessionState(userId),
          });
        }

        const subs = await Product.distinct('subcategory', {
          companyId: company._id,
          category: matchedCategory,
          available: true,
        });
        const visibleSubs = (subs || []).filter(Boolean);
        const targetSub = matchItem(subRaw, visibleSubs);
        if (!targetSub) {
          responseMessage = mountNotFoundResponse();
          return res.status(200).json({
            success: true,
            intent,
            confidence: aiResult.confidence,
            message: responseMessage,
            error: `Subcategory not found: "${subRaw}"`,
            sessionState: getSessionState(userId),
          });
        }

        setLastCategory(userId, matchedCategory);
        setLastSubcategory(userId, targetSub);
        const products = await Product.find({
          companyId: company._id,
          category: matchedCategory,
          subcategory: targetSub,
          available: true,
        });
        if (!products.length) {
          responseMessage = mountNotFoundResponse();
          return res.status(200).json({
            success: true,
            intent,
            confidence: aiResult.confidence,
            message: responseMessage,
            error: 'No products in subcategory',
            sessionState: getSessionState(userId),
          });
        }
        setLastProduct(userId, products[0]._id.toString());
        responseMessage = mountProductListResponse(
          products.map((p: any) => ({ name: p.name, price: p.price }))
        );
        return res.status(200).json({
          success: true,
          intent,
          confidence: aiResult.confidence,
          message: responseMessage,
          sessionState: getSessionState(userId),
        });
      }

      case 'VIEW_PRODUCT': {
        const productRaw = (aiResult.product || '').trim();
        if (!productRaw && !getLastProduct(userId)) {
          responseMessage = mountNotFoundResponse();
          return res.status(200).json({
            success: true,
            intent,
            confidence: aiResult.confidence,
            message: responseMessage,
            error: 'No product provided and no lastProduct in session',
            sessionState: getSessionState(userId),
          });
        }

        let productDoc: any = null;
        if (productRaw) {
          try {
            productDoc = await Product.findOne({
              companyId: company._id,
              name: { $regex: productRaw, $options: 'i' },
              available: true,
            }).collation({ locale: 'pt', strength: 1 });
          } catch (err) {
            console.warn('[TEST] Collation search failed');
          }
          if (!productDoc) {
            const candidates = await Product.find({ companyId: company._id, available: true }).limit(200);
            const names = candidates.map((p: any) => p.name || '');
            const fuzzy = findClosestMatch(productRaw, names, 60);
            if (fuzzy.match) productDoc = candidates.find((p: any) => p.name === fuzzy.match) || null;
          }
        } else {
          const lastId = getLastProduct(userId);
          if (lastId) productDoc = await Product.findById(lastId);
        }

        if (!productDoc) {
          responseMessage = mountNotFoundResponse();
          return res.status(200).json({
            success: true,
            intent,
            confidence: aiResult.confidence,
            message: responseMessage,
            error: 'Product not found',
            sessionState: getSessionState(userId),
          });
        }

        setLastProduct(userId, productDoc._id.toString());

        try {
          const aiResponse = await generateProductResponse({
            productName: productDoc.name,
            productDescription: productDoc.description,
            productPrice: productDoc.price,
            productCategory: productDoc.category,
            productSubcategory: productDoc.subcategory,
            userMessage: text,
            companyName: company.name,
          });

          responseMessage = aiResponse || mountNotFoundResponse();
        } catch (err) {
          responseMessage = mountNotFoundResponse();
          console.error('[TEST] Error generating product response:', err);
        }

        return res.status(200).json({
          success: true,
          intent,
          confidence: aiResult.confidence,
          message: responseMessage,
          sessionState: getSessionState(userId),
        });
      }

      case 'ASK_PRODUCT_ATTRIBUTE': {
        const productRaw = (aiResult.product || '').trim();
        let productDoc: any = null;
        if (productRaw) {
          try {
            productDoc = await Product.findOne({
              companyId: company._id,
              name: { $regex: productRaw, $options: 'i' },
            }).collation({ locale: 'pt', strength: 1 });
          } catch (err) {
            console.warn('[TEST] Collation search failed');
          }
        }
        if (!productDoc) {
          const lastId = getLastProduct(userId);
          if (lastId) productDoc = await Product.findById(lastId);
        }
        if (!productDoc) {
          responseMessage = mountNotFoundResponse();
          return res.status(200).json({
            success: true,
            intent,
            confidence: aiResult.confidence,
            message: responseMessage,
            error: 'Product not found',
            sessionState: getSessionState(userId),
          });
        }

        try {
          const aiResponse = await generateProductResponse({
            productName: productDoc.name,
            productDescription: productDoc.description,
            productPrice: productDoc.price,
            productCategory: productDoc.category,
            productSubcategory: productDoc.subcategory,
            userMessage: text,
            companyName: company.name,
          });

          responseMessage = aiResponse || mountNotFoundResponse();
        } catch (err) {
          responseMessage = mountNotFoundResponse();
          console.error('[TEST] Error generating attribute response:', err);
        }

        return res.status(200).json({
          success: true,
          intent,
          confidence: aiResult.confidence,
          message: responseMessage,
          sessionState: getSessionState(userId),
        });
      }

      case 'LIST_PRODUCTS': {
        const categoryRaw = (aiResult.category || getLastCategory(userId) || '').trim();
        const subRaw = (aiResult.subcategory || getLastSubcategory(userId) || '').trim();
        if (!categoryRaw && !subRaw) {
          responseMessage = mountNotFoundResponse();
          return res.status(200).json({
            success: true,
            intent,
            confidence: aiResult.confidence,
            message: responseMessage,
            error: 'No category/subcategory provided or in session',
            sessionState: getSessionState(userId),
          });
        }

        let matchedCategory: string | null = null;
        if (categoryRaw) {
          const cats = await listCategories(company._id);
          matchedCategory = matchItem(categoryRaw, cats);
        } else matchedCategory = getLastCategory(userId) || null;

        if (!matchedCategory) {
          responseMessage = mountNotFoundResponse();
          return res.status(200).json({
            success: true,
            intent,
            confidence: aiResult.confidence,
            message: responseMessage,
            error: 'Category not found',
            sessionState: getSessionState(userId),
          });
        }

        let matchedSub: string | null = null;
        if (subRaw) {
          const subs = await Product.distinct('subcategory', {
            companyId: company._id,
            category: matchedCategory,
            available: true,
          });
          matchedSub = matchItem(subRaw, (subs || []).filter(Boolean));
        }

        const query: any = { companyId: company._id, category: matchedCategory, available: true };
        if (matchedSub) query.subcategory = matchedSub;

        const products = await Product.find(query).limit(100);
        if (!products.length) {
          responseMessage = mountNotFoundResponse();
          return res.status(200).json({
            success: true,
            intent,
            confidence: aiResult.confidence,
            message: responseMessage,
            error: 'No products found',
            sessionState: getSessionState(userId),
          });
        }

        setLastCategory(userId, matchedCategory);
        if (matchedSub) setLastSubcategory(userId, matchedSub);
        setLastProduct(userId, products[0]._id.toString());

        responseMessage = mountProductListResponse(products.map((p: any) => ({ name: p.name, price: p.price })));
        return res.status(200).json({
          success: true,
          intent,
          confidence: aiResult.confidence,
          message: responseMessage,
          sessionState: getSessionState(userId),
        });
      }

      case 'TALK_TO_HUMAN': {
        setHandOff(userId);
        responseMessage = '👤 Um atendente humano entrará em contato em breve.';
        return res.status(200).json({
          success: true,
          intent,
          confidence: aiResult.confidence,
          message: responseMessage,
          sessionState: getSessionState(userId),
        });
      }

      case 'UNKNOWN':
      default: {
        responseMessage = mountNotFoundResponse();
        return res.status(200).json({
          success: true,
          intent: 'UNKNOWN',
          confidence: aiResult.confidence,
          message: responseMessage,
          sessionState: getSessionState(userId),
        });
      }
    }
  } catch (err) {
    console.error('[TEST] Error:', err);
    return res.status(500).json({
      success: false,
      error: (err as any).message || 'Internal server error',
    });
  }
});

// GET /test/session/:userId - Get session state
router.get('/test/session/:userId', (req: Request, res: Response) => {
  const { userId } = req.params;
  res.json(getSessionState(userId));
});

// DELETE /test/session/:userId - Reset session
router.delete('/test/session/:userId', (req: Request, res: Response) => {
  const { userId } = req.params;
  resetSession(userId);
  res.json({ success: true, message: `Session for ${userId} reset` });
});

export default router;
