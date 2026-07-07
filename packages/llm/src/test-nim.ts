import dotenv from 'dotenv';
import path from 'path';
import OpenAI from 'openai';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

async function test() {
  const apiKey = process.env.NVIDIA_API_KEY;
  console.log('Chave encontrada:', apiKey ? 'Sim (começa com ' + apiKey.slice(0, 10) + ')' : 'Não');
  
  if (!apiKey) return;

  const openai = new OpenAI({
    apiKey,
    baseURL: 'https://integrate.api.nvidia.com/v1',
    timeout: 10000 // 10s
  });

  console.log('Enviando request de teste para NVIDIA NIM (meta/llama-3.3-70b-instruct)...');
  try {
    const start = Date.now();
    const response = await openai.chat.completions.create({
      model: 'meta/llama-3.3-70b-instruct',
      messages: [{ role: 'user', content: 'responda apenas com OK' }],
      max_tokens: 10
    });
    console.log('Resposta em', Date.now() - start, 'ms:');
    console.log(response.choices[0]?.message?.content);
  } catch (err: any) {
    console.error('Erro na chamada da NVIDIA:', err.message || err);
  }
}

test();
