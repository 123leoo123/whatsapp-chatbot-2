import { type Request, type Response } from 'express';
import { sendTextMessage } from '../services/whatsapp.service';
import { Company } from '../models/company';
import { Product } from '../models/product';

const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

const getQueryValue = (req: Request, key: string): string | undefined => {
  const raw = req.query[key];

  if (Array.isArray(raw)) {
    const first = raw[0];
    return typeof first === 'string' ? first : undefined;
  }

  return typeof raw === 'string' ? raw : undefined;
};

const getFirstItem = <T>(value: unknown): T | undefined => {
  if (Array.isArray(value) && value.length > 0) {
    return value[0] as T;
  }
  return undefined;
};

const extractTextMessage = (payload: unknown): { from: string; text: string } | undefined => {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const entry = getFirstItem<any>((payload as Record<string, unknown>).entry);
  const change = entry ? getFirstItem<any>(entry.changes) : undefined;
  const value = change?.value;
  const message = value ? getFirstItem<any>(value.messages) : undefined;

  const type = message?.type;
  const from = message?.from;
  const text = message?.text?.body;

  if (type === 'text' && typeof from === 'string' && typeof text === 'string') {
    return { from, text };
  }

  return undefined;
};

const normalizeText = (text: string): string =>
  text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const shouldSendGreeting = (text: string): boolean => {
  const normalized = normalizeText(text);
  return normalized === 'oi' || normalized === 'ola';
};

// export const verifyWebhook = (req: Request, res: Response): void => {
//   const mode = getQueryValue(req, 'hub.mode');
//   const verifyToken = getQueryValue(req, 'hub.verify_token');
//   const challenge = getQueryValue(req, 'hub.challenge');

//   if (mode === 'subscribe' && verifyToken === WHATSAPP_VERIFY_TOKEN) {
//     res.status(200).send(challenge);
//     return;
//   }

//   res.sendStatus(403);
// };

// export const verifyWebhook = (req: Request, res: Response) => {
//   const mode = req.query['hub.mode'];
//   const token = req.query['hub.verify_token'];
//   const challenge = req.query['hub.challenge'];

//   console.log('--- VERIFY WEBHOOK DEBUG ---');
//   console.log('hub.mode:', mode);
//   console.log('hub.verify_token:', token);
//   console.log('hub.challenge:', challenge);
//   console.log('ENV TOKEN:', process.env.WHATSAPP_VERIFY_TOKEN);
//   console.log('-----------------------------');

//   if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
//     return res.status(200).send(challenge);
//   }

//   return res.sendStatus(403);
// };

export const verifyWebhook = (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (
    mode === 'subscribe' &&
    token === process.env.WHATSAPP_VERIFY_TOKEN
  ) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
};


export const handleWebhookEvent = async (req: Request, res: Response) => {
  const value = req.body?.entry?.[0]?.changes?.[0]?.value;

  // Segurança: payload inválido
  if (!value) {
    return res.status(200).json({ received: true });
  }

  // 🔑 IDENTIFICA A EMPRESA (MULTI-TENANT)
  const phoneNumberId = value?.metadata?.phone_number_id;

  if (!phoneNumberId) {
    return res.status(200).json({ received: true });
  }

  const company = await Company.findOne({
    whatsappPhoneNumberId: phoneNumberId,
  });

  // Empresa não cadastrada → ignora
  if (!company) {
    return res.status(200).json({ received: true });
  }

  // 🗣️ MENSAGEM DO USUÁRIO
  const message = value?.messages?.[0];

  if (!message || !message.text) {
    return res.status(200).json({ received: true });
  }

  const from = message.from;
  const text = message.text.body.toLowerCase();

  // 🔒 Anti-loop (ignora mensagens do próprio bot)
  if (from === phoneNumberId) {
    return res.status(200).json({ received: true });
  }

  // 👋 SAUDAÇÃO
  if (text === 'oi' || text === 'olá' || text === 'ola') {
    await sendTextMessage(
      from,
      `Olá! 👋 Aqui é o atendimento da *${company.name}*.
Digite:
1️⃣ Ver produtos
2️⃣ Endereço
3️⃣ Falar com atendente`
    );
  }

  // 📦 LISTAR PRODUTOS
  if (text === '1') {
    const products = await Product.find({
      companyId: company._id,
    }).limit(5);

    if (!products.length) {
      await sendTextMessage(
        from,
        'No momento não temos produtos cadastrados.'
      );
      return res.status(200).json({ received: true });
    }

    const list = products
      .map(p => `• ${p.name} — R$${p.price}`)
      .join('\n');

    await sendTextMessage(
      from,
      `📦 Produtos da *${company.name}*:\n${list}\n\nDigite o nome para saber mais.`
    );
  }

  return res.status(200).json({ received: true });
};

