/**
 * Diagnóstico Telegram — COS Notification Service
 *
 * Este script:
 *   1. Verifica se TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID estão configurados
 *   2. Testa a conexão com a API do Telegram
 *   3. Se TELEGRAM_CHAT_ID não estiver definido, busca automaticamente
 *      via getUpdates (você precisa ter enviado uma mensagem ao bot antes)
 *   4. Envia uma mensagem de boas-vindas confirmando que está funcionando
 *
 * USO:
 *   npx tsx packages/notifications/src/diagnose.ts
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const BOT_TOKEN = process.env['TELEGRAM_BOT_TOKEN'];
const CHAT_ID   = process.env['TELEGRAM_CHAT_ID'];
const API       = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function run() {
  console.log('\n🔍 COS — Diagnóstico Telegram\n');

  if (!BOT_TOKEN) {
    console.error('❌ TELEGRAM_BOT_TOKEN não está definido no .env');
    console.log('\nPara obter o token:');
    console.log('  1. Abra o Telegram e converse com @BotFather');
    console.log('  2. Envie /newbot e siga as instruções');
    console.log('  3. Adicione ao .env: TELEGRAM_BOT_TOKEN=seu_token_aqui\n');
    process.exit(1);
  }

  console.log(`✅ TELEGRAM_BOT_TOKEN: ...${BOT_TOKEN.slice(-8)}`);

  // Testa a conexão
  let botName = 'desconhecido';
  try {
    const res = await fetch(`${API}/getMe`);
    const data = await res.json() as { ok: boolean; result: { username: string; first_name: string } };
    if (!data.ok) throw new Error('API retornou ok=false');
    botName = `${data.result.first_name} (@${data.result.username})`;
    console.log(`✅ Bot conectado: ${botName}`);
  } catch (err) {
    console.error(`❌ Falha ao conectar com a API do Telegram: ${err}`);
    console.log('Verifique se o token está correto.');
    process.exit(1);
  }

  // Descobre o CHAT_ID
  let chatId = CHAT_ID;

  if (!chatId) {
    console.log('\n⚠️  TELEGRAM_CHAT_ID não está definido. Tentando descobrir automaticamente...');
    console.log('   (Você precisa ter enviado uma mensagem para o bot primeiro)\n');

    const res = await fetch(`${API}/getUpdates?limit=10`);
    const data = await res.json() as { ok: boolean; result: Array<{ message?: { chat: { id: number }; from?: { username?: string } } }> };

    if (!data.ok || data.result.length === 0) {
      console.error('❌ Nenhuma mensagem encontrada. Por favor:');
      console.log(`  1. Abra o Telegram`);
      console.log(`  2. Encontre o bot: ${botName}`);
      console.log(`  3. Envie qualquer mensagem (ex: "oi")`);
      console.log(`  4. Execute este script novamente\n`);
      process.exit(1);
    }

    const firstMessage = data.result.find(u => u.message);
    if (!firstMessage?.message) {
      console.error('❌ Updates encontrados mas sem messages. Envie uma mensagem de texto ao bot.');
      process.exit(1);
    }

    chatId = String(firstMessage.message.chat.id);
    const username = firstMessage.message.from?.username;
    console.log(`✅ CHAT_ID descoberto: ${chatId}${username ? ` (@${username})` : ''}`);
    console.log(`\n📝 Adicione ao seu .env:`);
    console.log(`   TELEGRAM_CHAT_ID=${chatId}\n`);
  } else {
    console.log(`✅ TELEGRAM_CHAT_ID: ${chatId}`);
  }

  // Envia mensagem de teste
  console.log('\n📨 Enviando mensagem de teste...');

  const testMessage = [
    '✅ *COS Notification Service — Online*',
    '',
    '🚀 O sistema está configurado e funcionando.',
    '💓 Você receberá heartbeats a cada hora.',
    '',
    '*Comandos disponíveis:*',
    '`/approve <content-id>` — aprova vídeo em revisão',
    '`/reject <content-id>` — rejeita vídeo em revisão',
  ].join('\n');

  const res = await fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: testMessage,
      parse_mode: 'Markdown',
    }),
  });

  const data = await res.json() as { ok: boolean; description?: string };
  if (data.ok) {
    console.log('✅ Mensagem enviada com sucesso!');
    console.log('\n🎉 Diagnóstico completo — tudo funcionando.\n');
  } else {
    console.error(`❌ Falha ao enviar mensagem: ${data.description}`);
    if (!CHAT_ID) {
      console.log(`\nTente adicionar manualmente ao .env: TELEGRAM_CHAT_ID=${chatId}`);
    }
    process.exit(1);
  }
}

run().catch(err => {
  console.error('\n❌ Erro inesperado:', err);
  process.exit(1);
});
