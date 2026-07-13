import { masterAudio } from '../../apps/agents/render/src/video-compositor';
import path from 'path';

async function runTest() {
  const inputVideo = path.resolve('../../tmp/outputs/kaka_v7_mastered_test.mp4');
  const bgm = path.resolve('../../musica ambiente/ovrsoull-melancholic-drone-grainy-textures-eerie-silence-cold-digital-pads-454741.mp3');
  const outputVideo = path.resolve('../../tmp/outputs/test_master_audio_output.mp4');
  
  // Fake total duration: 30000ms
  const totalDurationMs = 30000; 

  console.log('Testing masterAudio...');
  try {
    await masterAudio(inputVideo, outputVideo, bgm, totalDurationMs, 0.5);
    console.log('Test completed! Output at:', outputVideo);
  } catch (err) {
    console.error('Test failed:', err);
  }
}

runTest();
