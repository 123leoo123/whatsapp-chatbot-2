type GenerateReplyParams = {
  system: string;
  user: string;
  context?: string;
};

type GenerateReplyResult = {
  text: string;
};

type HumanizeReplyParams = {
  companyName: string;
  baseText: string;
};

export const humanizeReply = async (
  params: HumanizeReplyParams
): Promise<string> => {
  const { companyName, baseText } = params;

  const system = `
Você é um atendente humano profissional de WhatsApp da empresa "${companyName}".

Sua função é APENAS reescrever mensagens para soar mais humanas.

REGRAS ABSOLUTAS:
- Não invente informações
- Não altere preços
- Não adicione dados
- Não mude o significado
- Não faça perguntas extras desnecessárias
- Use emojis com moderação
- Linguagem natural, educada e clara
`;

  const user = `
Mensagem base:
"${baseText}"

Reescreva mantendo o mesmo sentido.
`;

  const result = await generateReply({
    system,
    user,
  });

  return result.text || baseText;
};

const OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';

const OLLAMA_MODEL =
  process.env.OLLAMA_MODEL ?? 'gemma:7b';

export const generateReply = async (
  params: GenerateReplyParams
): Promise<GenerateReplyResult> => {
  const { system, user, context } = params;

  const prompt = [
    `SYSTEM:\n${system}`,
    context ? `\nCONTEXTO:\n${context}` : '',
    `\nUSUÁRIO:\n${user}`,
    `\nASSISTENTE:\n`,
  ].join('');

  // Log request metadata for debugging
  console.log('AI.generateReply -> calling Ollama', {
    OLLAMA_BASE_URL,
    OLLAMA_MODEL,
    promptPreview: prompt.slice(0, 400),
  });

  try {
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
          temperature: 0.4,
          num_predict: 180,
        },
      }),
    });

    const raw = await response.text();

    if (!response.ok) {
      console.error('AI.generateReply -> Ollama error response', {
        status: response.status,
        body: raw,
      });
      throw new Error(
        `Erro ao gerar resposta da IA: ${response.status} - ${raw}`
      );
    }

    // Try parse JSON, but log raw body if parsing fails
    let data: { response?: string } = {};
    try {
      data = JSON.parse(raw) as { response?: string };
    } catch (e) {
      console.warn('AI.generateReply -> failed to parse JSON from Ollama', e);
    }

    const text = (data.response ?? raw ?? '').trim();
    console.log('AI.generateReply -> received text length', text.length);

    return {
      text,
    };
  } catch (err) {
    console.error('AI.generateReply -> fetch error', err);
    throw err;
  }
};
