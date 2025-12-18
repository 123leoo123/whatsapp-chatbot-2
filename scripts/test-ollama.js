"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ai_service_1 = require("../src/services/ai.service");
async function run() {
    try {
        const res = await (0, ai_service_1.generateReply)({
            system: 'Você é um assistente de teste.',
            user: 'Teste de integração com Ollama.',
            context: 'Contexto de teste',
        });
        console.log('Test result:', res);
    }
    catch (err) {
        console.error('Test failed:', err);
        process.exitCode = 2;
    }
}
run();
