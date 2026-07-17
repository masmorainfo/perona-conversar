/**
 * inject_test_signal.js
 * 
 * Injeta um sinal de teste diretamente na fila raw_signals do Railway,
 * simulando uma trend capturada pelo World Observer.
 * 
 * Uso: node inject_test_signal.js
 * Requer: REDIS_URL apontando para o Railway Redis
 */

const { createClient } = require('redis');

const REDIS_URL = process.env.REDIS_URL || 'redis://default:VJZdoPnqsrkzjfEzYIWEASKTmvtFcHmK@redis.railway.internal:6379';

// Sinal de teste — tema de futebol relevante
const testSignal = {
  id: `test-signal-${Date.now()}`,
  sensorName: 'Manual-Test',
  topic: 'Cristiano Ronaldo marca hat-trick histórico na Al-Nassr',
  rawContent: 'CR7 marca três gols em vitória da Al-Nassr sobre rival saudita. Português iguala recorde de gols em uma única temporada.',
  source: 'test-injection',
  collectedAt: new Date().toISOString(),
  relevanceScore: 0.95,
  metadata: {
    category: 'football',
    player: 'Cristiano Ronaldo',
    competition: 'Saudi Pro League',
    injectedBy: 'e2e-test'
  }
};

async function main() {
  console.log('🔌 Conectando ao Redis Railway...');
  
  const client = createClient({ url: REDIS_URL });
  
  client.on('error', (err) => {
    console.error('❌ Redis error:', err.message);
  });

  await client.connect();
  console.log('✅ Conectado ao Redis.');

  // Publica na fila raw_signals (BullMQ usa lista com prefixo bull:)
  const queueName = 'bull:raw_signals:';
  
  // Verifica as chaves disponíveis para entender o formato da fila
  const keys = await client.keys('bull:*');
  console.log('\n📋 Filas BullMQ disponíveis:');
  const queueNames = [...new Set(keys.map(k => k.split(':').slice(0, 3).join(':')))];
  queueNames.forEach(q => console.log('  ', q));

  // Formato BullMQ: LPUSH bull:<queue>:wait <job-json>
  const jobPayload = JSON.stringify({
    id: testSignal.id,
    name: 'raw_signal',
    data: testSignal,
    opts: { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
    timestamp: Date.now(),
    delay: 0,
    priority: 0
  });

  // Tenta identificar o nome exato da fila de sinais
  const signalQueueKey = keys.find(k => k.includes('raw_signals') && k.endsWith(':wait'));
  
  if (signalQueueKey) {
    await client.lPush(signalQueueKey, jobPayload);
    console.log(`\n🚀 Sinal injetado em: ${signalQueueKey}`);
    console.log('📡 Tópico:', testSignal.topic);
    
    // Verifica comprimento da fila
    const qLen = await client.lLen(signalQueueKey);
    console.log(`📊 Jobs na fila: ${qLen}`);
  } else {
    console.log('\n⚠️  Fila raw_signals:wait não encontrada. Chaves disponíveis:');
    keys.filter(k => k.includes('signal')).forEach(k => console.log('  ', k));
    
    // Fallback: tenta publicar no canal pub/sub
    await client.publish('raw_signals', JSON.stringify(testSignal));
    console.log('📡 Publicado via pub/sub no canal raw_signals');
  }

  await client.disconnect();
  console.log('\n✅ Feito. Aguarde a notificação no Telegram...');
}

main().catch(err => {
  console.error('❌ Falha:', err.message);
  process.exit(1);
});
