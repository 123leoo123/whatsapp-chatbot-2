# Checklist Chatbot 2.0 — Pronto para Testar

## ✅ Pré-requisitos (verifique antes de iniciar)

- [ ] **MongoDB online** — Conecte e verifique no Atlas
  ```bash
  # Teste a conexão via .env MONGODB_URI
  ```

- [ ] **Ollama/LLM rodando** — Verifique que está escutando em `http://127.0.0.1:11434`
  ```bash
  curl http://127.0.0.1:11434/api/tags
  # Deve retornar lista de modelos disponíveis
  ```

- [ ] **WhatsApp API configurada** — Verifique `WHATSAPP_ACCESS_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID` no `.env`

- [ ] **Variáveis de ambiente** — Confirme que `.env` tem tudo configurado

---

## 🚀 Passo 1: Popular Banco de Dados

Se é primeira vez, rode o seed:
```bash
npm run seed
```

Isso cria:
- Uma empresa (Loja Demo)
- Alguns produtos de teste (Camiseta, Boné, etc.)

---

## 🚀 Passo 2: Iniciar o Servidor

**Opção A — Desenvolvimento (com hot reload):**
```bash
npm run dev
```

**Opção B — Produção (compilação + run):**
```bash
npm start
```

Servidor roda em `http://localhost:3000`

---

## 🧪 Passo 3: Testar (SEM WhatsApp)

Use o endpoint de simulação para testar sem WhatsApp:

```bash
curl -X POST http://localhost:3000/test/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_123",
    "companyId": "INSERIR_COMPANY_ID_AQUI",
    "text": "quero ver camisetas"
  }'
```

**Fluxos para testar:**

1. **Listar categorias:**
   ```json
   {"userId": "user1", "companyId": "xxx", "text": "quero ver produtos"}
   ```

2. **Ver categoria (ex: Camiseta):**
   ```json
   {"userId": "user1", "companyId": "xxx", "text": "quero ver camisetas"}
   ```

3. **Perguntar sobre produto:**
   ```json
   {"userId": "user1", "companyId": "xxx", "text": "qual é a mais barata?"}
   ```

4. **Falar com humano:**
   ```json
   {"userId": "user1", "companyId": "xxx", "text": "quero falar com um atendente"}
   ```

5. **Teste após humano (deve bloquear):**
   ```json
   {"userId": "user1", "companyId": "xxx", "text": "quero ver mais produtos"}
   ```
   (Esperado: resposta dizendo que atendente humano está em andamento)

---

## 📋 Passo 4: Rodar Testes Unitários

```bash
npm test
```

Todos devem passar (8 suites).

---

## 🔍 Passo 5: Monitorar Logs

Observe os logs do terminal para:
- `[WebhookController]` — eventos do webhook
- `[AI Intent]` — interpretação da IA
- `[ProductResponse]` — geração de respostas
- Erros de conexão MongoDB/Ollama

---

## ✅ Quando está pronto para produção

- [ ] Todos os testes unitários passam
- [ ] Fluxos acima testados e funcionando
- [ ] MongoDB persistindo dados
- [ ] Ollama respondendo interpretações
- [ ] WhatsApp webhook recebendo mensagens (testa via webhook real se quiser)
- [ ] Logs limpos e sem erros

---

## 🆘 Se algo quebrar

1. **"Cannot find module"** → Rode `npm run build` novamente
2. **"MongoDB connection refused"** → Verifique `MONGODB_URI` no `.env`
3. **"Ollama not responding"** → Inicie Ollama ou verifique `OLLAMA_BASE_URL`
4. **"JSON parse error"** → Verifique formato da requisição `/test/simulate`

---

## 📚 Endpoint de Teste

**URL:** `POST http://localhost:3000/test/simulate`

**Body:**
```json
{
  "userId": "string (unique user ID)",
  "companyId": "string (MongoDB ObjectId)",
  "text": "string (user message)"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Message sent to user_123",
  "intent": "VIEW_CATEGORY",
  "confidence": 0.95
}
```

---

Pronto para começar? Comece pelo Passo 1! 🎉
