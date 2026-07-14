import fs from 'fs';
import path from 'path';

const botToken = '8513304040:AAHF-w_vsE0ZcTyljz2m5-3dbPAJZhZfVg8';
const chatId = '-1003892983168';
const videoPath = 'C:\\AI\\perona - conversar\\tmp\\outputs\\25b9449d-28f5-4758-9d84-f7b23a067d7d_670e89d3-4a29-4a0a-ab84-6734bc39446e.mp4';

const videoBuffer = fs.readFileSync(videoPath);
const blob = new Blob([videoBuffer], { type: 'video/mp4' });

const formData = new FormData();
formData.append('chat_id', chatId);
formData.append('video', blob, 'kaka_redenção.mp4');
formData.append('caption', '🎬 Vídeo renderizado — A Redenção de Kaká\n\nAssista e decida se aprova para publicação.');
formData.append('parse_mode', 'Markdown');

console.log(`Enviando vídeo (${(videoBuffer.length / 1024 / 1024).toFixed(1)}MB) ao Telegram...`);

const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendVideo`, {
  method: 'POST',
  body: formData,
});

const data = await resp.json();
if (data.ok) {
  console.log('✅ Vídeo enviado com sucesso! Message ID:', data.result.message_id);
} else {
  console.error('❌ Erro:', data.description);
}
