import { Request, Response } from 'express';
import { sendTextMessage } from '../services/whatsapp.service';
import { detectIntent } from '../services/intent.services';
import { generateReply } from '../services/ai.service';
import { Company } from '../models/company';
import { Product } from '../models/product';
import { setLastProduct, getLastProduct } from '../services/session.service';

export const verifyWebhook = (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
};

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
  const text = message.text.body;

  // anti-loop
  if (from === phoneNumberId) return res.status(200).json({ received: true });

  const intentResult = detectIntent(text);

  switch (intentResult.intent) {
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

    case 'LIST_PRODUCTS': {
      const products = await Product.find({
        companyId: company._id,
        available: true,
      }).limit(5);

      if (!products.length) {
        await sendTextMessage(
          from,
          'No momento não temos produtos cadastrados.'
        );
        break;
      }

      setLastProduct(from, products[0]._id.toString());

      const list = products
        .map(p => `• ${p.name} — R$${p.price}`)
        .join('\n');

      await sendTextMessage(
        from,
        `📦 Produtos da *${company.name}*:\n${list}\n\nPode perguntar sobre qualquer um deles 😊`
      );
      break;
    }

    case 'PRODUCT_QUERY': {
      let product = await Product.findOne({
        companyId: company._id,
        name: { $regex: intentResult.query ?? '', $options: 'i' },
      });

      if (!product) {
        const lastProductId = getLastProduct(from);
        if (lastProductId) {
          product = await Product.findById(lastProductId);
        }
      }

      if (!product) {
        await sendTextMessage(
          from,
          'Não consegui identificar qual produto você quer saber mais 😕'
        );
        break;
      }

      // 🧠 IA = SOMENTE HUMANIZAÇÃO
      // Permitir chamada à IA mesmo se descrição/preço estiverem ausentes.
      // Passamos valores padrão no contexto e a IA deve indicar se não há informação suficiente.
      try {
        const systemPrompt = `
Você é um atendente humano de loja conversando no WhatsApp.
Seja educado, natural e objetivo.
Responda apenas com base nas informações fornecidas.
Se não houver informação suficiente, diga isso claramente.
Não invente nada.
`;

        const description = product.description || 'Descrição não informada';
        const price = (product.price !== undefined && product.price !== null) ? `R$${product.price}` : 'Preço não informado';

        const context = `
      Produto: ${product.name}
      Descrição: ${description}
      Preço: ${price}
      `;

        console.log('webhook -> calling generateReply', {
          from,
          productId: product._id?.toString ? product._id.toString() : product._id,
          productName: product.name,
          userText: text,
          contextPreview: context.slice(0, 400),
        });

        const aiResponse = await generateReply({
          system: systemPrompt,
          user: text,
          context,
        });

        console.log('webhook -> generateReply returned', {
          textLength: aiResponse?.text?.length ?? 0,
        });

        if (!aiResponse.text || aiResponse.text.trim().length < 5) {
          await sendTextMessage(
            from,
            'Não tenho essa informação com precisão agora 😕\nPosso chamar um atendente humano se quiser.'
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

    case 'ADDRESS':
      await sendTextMessage(from, `📍 Endereço:\n${company.address}`);
      break;

    case 'BUSINESS_HOURS':
      await sendTextMessage(from, `⏰ Horário:\n${company.businessHours}`);
      break;

    case 'PAYMENT':
      await sendTextMessage(
        from,
        `💳 Formas de pagamento:\n${company.paymentMethods.join(', ')}`
      );
      break;

    case 'HUMAN':
      await sendTextMessage(
        from,
        '👤 Um atendente humano entrará em contato em breve.'
      );
      break;
  }

  return res.status(200).json({ received: true });
};