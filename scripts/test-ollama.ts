import { generateReply } from '../src/services/ai.service';

async function run() {
  try {
    const res = await generateReply({
      system: 'Você é um assistente de teste.',
      user: 'Teste de integração com Ollama.',
      context: 'Contexto de teste',
    });

    console.log('Test result:', res);
  } catch (err) {
    console.error('Test failed:', err);
    process.exitCode = 2;
  }
}

run();
