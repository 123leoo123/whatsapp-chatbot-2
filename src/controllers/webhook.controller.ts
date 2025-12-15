import { type Request, type Response } from 'express';
import { sendTextMessage } from '../services/whatsapp.service';

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

export const verifyWebhook = (req: Request, res: Response): void => {
  const mode = getQueryValue(req, 'hub.mode');
  const verifyToken = getQueryValue(req, 'hub.verify_token');
  const challenge = getQueryValue(req, 'hub.challenge');

  if (mode === 'subscribe' && verifyToken === WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge);
    return;
  }

  res.sendStatus(403);
};

export const handleWebhookEvent = async (req: Request, res: Response): Promise<void> => {
  console.log('WhatsApp webhook received:', req.body);

  const incomingMessage = extractTextMessage(req.body);

  if (incomingMessage && shouldSendGreeting(incomingMessage.text)) {
    try {
      await sendTextMessage(incomingMessage.from, 'Olá! 👋 Como posso ajudar?');
    } catch (error) {
      console.error('Failed to send greeting message', error);
    }
  }

  res.status(200).json({ received: true });
};
