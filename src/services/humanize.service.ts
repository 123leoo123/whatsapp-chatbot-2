type HumanizeParams = {
  baseText: string;
  companyName: string;
};

const OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';

const OLLAMA_MODEL =
  process.env.OLLAMA_MODEL ?? 'gemma:7b';

export const humanizeReply = async ({
  baseText,
  companyName,
}: HumanizeParams): Promise<string> => {
  const prompt = `
Você é um atendente humano de WhatsApp da empresa "${companyName}".

REGRAS IMPORTANTES:
- NÃO adicione informações novas
- NÃO invente preços, promoções ou condições
- NÃO faça perguntas novas
- NÃO mude o significado do texto
- Apenas torne a mensagem mais natural, educada e amigável
- Linguagem simples, brasileira e profissional
- Mensagem curta (WhatsApp)

TEXTO ORIGINAL:
"""
${baseText}
"""

REESCREVA O TEXTO:
`;

  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      options: {
        temperature: 0.3,
        num_predict: 120,
      },
    }),
  });

  if (!response.ok) {
    // fallback seguro → retorna texto original
    return baseText;
  }

  const data = (await response.json()) as { response?: string };

  return (data.response ?? baseText).trim();
};
