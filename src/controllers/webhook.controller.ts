import { Request, Response } from 'express';
import { sendTextMessage } from '../services/whatsapp.service';
import { detectIntent } from '../services/intent.services';
import { Company } from '../models/company';
import { Product } from '../models/product';

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
        await sendTextMessage(from, 'No momento não temos produtos cadastrados.');
        break;
      }

      const list = products
        .map(p => `• ${p.name} — R$${p.price}`)
        .join('\n');

      await sendTextMessage(
        from,
        `📦 Produtos da *${company.name}*:\n${list}\n\nDigite o nome do produto para saber mais.`
      );
      break;
    }

    case 'PRODUCT_QUERY': {
      const product = await Product.findOne({
        companyId: company._id,
        name: { $regex: intentResult.query, $options: 'i' },
      });

      if (!product) {
        await sendTextMessage(from, 'Não encontrei esse produto 😕');
        break;
      }

      await sendTextMessage(
        from,
        `🛍️ *${product.name}*
${product.description}
💰 R$${product.price}`
      );
      break;
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
