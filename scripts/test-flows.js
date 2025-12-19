#!/usr/bin/env node
/**
 * Manual test script to simulate chatbot flows via HTTP
 * Usage: node scripts/test-flows.js
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const USER_ID = 'test-user-123';
const COMPANY_NAME = 'Loja Teste'; // Adjust to your test company name

const tests = [
  {
    name: '1️⃣ First Message: "quero ver calças"',
    payload: { userId: USER_ID, companyName: COMPANY_NAME, text: 'quero ver calças' },
    expectIntent: 'VIEW_CATEGORY',
  },
  {
    name: '2️⃣ Follow-up: "jeans"',
    payload: { userId: USER_ID, companyName: COMPANY_NAME, text: 'jeans' },
    expectIntent: 'VIEW_SUBCATEGORY',
  },
  {
    name: '3️⃣ Check session state',
    method: 'GET',
    url: `${BASE_URL}/test/session/${USER_ID}`,
  },
  {
    name: '4️⃣ Reset session',
    method: 'DELETE',
    url: `${BASE_URL}/test/session/${USER_ID}`,
  },
  {
    name: '5️⃣ New flow: "tem produtos?"',
    payload: { userId: `${USER_ID}-2`, companyName: COMPANY_NAME, text: 'tem produtos?' },
    expectIntent: 'LIST_CATEGORIES',
  },
  {
    name: '6️⃣ Human handoff: "quero falar com alguém"',
    payload: { userId: `${USER_ID}-3`, companyName: COMPANY_NAME, text: 'quero falar com alguém' },
    expectIntent: 'TALK_TO_HUMAN',
  },
];

async function runTests() {
  console.log('🧪 Starting Chatbot 2.0 Flow Tests\n');
  console.log(`Base URL: ${BASE_URL}\n`);

  for (const test of tests) {
    try {
      console.log(`\n--- ${test.name} ---`);

      let response;
      if (test.method === 'GET') {
        response = await axios.get(test.url!);
        console.log('✅ Session state retrieved:');
        console.log(JSON.stringify(response.data, null, 2));
      } else if (test.method === 'DELETE') {
        response = await axios.delete(test.url!);
        console.log('✅ Session reset successful');
      } else {
        console.log(`Sending: "${test.payload!.text}"`);
        response = await axios.post(`${BASE_URL}/test/simulate`, test.payload);

        const { intent, confidence, message, error, sessionState } = response.data;

        console.log(`\n📊 Result:`);
        console.log(`  Intent: ${intent}`);
        console.log(`  Confidence: ${confidence}`);
        console.log(`  Message: ${message?.substring(0, 100)}${message?.length > 100 ? '...' : ''}`);
        if (error) console.log(`  Error: ${error}`);

        if (test.expectIntent && intent !== test.expectIntent) {
          console.log(`\n⚠️  Expected: ${test.expectIntent}, got: ${intent}`);
        } else if (test.expectIntent) {
          console.log(`\n✅ Intent matched (expected: ${test.expectIntent})`);
        }

        console.log(`\n📍 Session after:`);
        console.log(JSON.stringify(sessionState, null, 2));
      }
    } catch (err: any) {
      console.error(`\n❌ Test failed: ${err.response?.data?.error || err.message}`);
      if (err.response?.data) {
        console.error(JSON.stringify(err.response.data, null, 2));
      }
    }
  }

  console.log('\n\n✨ Test suite complete!');
}

runTests().catch(console.error);
