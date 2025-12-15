import axios from 'axios';

const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

const getEndpoint = (phoneNumberId: string): string =>
  `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;

export const sendTextMessage = async (to: string, message: string): Promise<void> => {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error('WhatsApp credentials are not configured');
  }

  await axios.post(
    getEndpoint(WHATSAPP_PHONE_NUMBER_ID),
    {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: {
        body: message,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );
};
