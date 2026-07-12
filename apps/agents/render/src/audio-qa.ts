import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface AudioQAResult {
  failed: boolean;
  warn: boolean;
  maxSilenceDuration: number;
  warnings: string[];
}

export async function runAudioQA(videoPath: string): Promise<AudioQAResult> {
  // Using the threshold determined by the user: -40dB
  const threshold = '-40dB';
  
  // Find silences >= 0.3s (warn threshold)
  // silencedetect minimum duration is 0.3s? Wait, ffmpeg silencedetect requires d >= 0.001
  const cmd = `ffmpeg -i "${videoPath}" -af "silencedetect=noise=${threshold}:d=0.3" -f null -`;
  
  let stderr = '';
  try {
    const { stderr: errOutput } = await execAsync(cmd);
    stderr = errOutput;
  } catch (err: any) {
    // FFmpeg logs to stderr and returns non-zero if output is null sometimes, or just captures stderr
    stderr = err.stderr || err.message;
  }

  // Parse silencedetect output
  // [silencedetect @ ...] silence_start: 3.5
  // [silencedetect @ ...] silence_end: 4.6 | silence_duration: 1.1
  
  const durationRegex = /silence_duration:\s+([\d.]+)/g;
  const startRegex = /silence_start:\s+([\d.]+)/g;
  
  let maxSilenceDuration = 0;
  const warnings: string[] = [];
  let block = false;
  let warn = false;

  // We need to parse both start and duration to construct meaningful warning messages
  const lines = stderr.split('\n');
  let currentStart = 0;

  for (const line of lines) {
    const startMatch = /silence_start:\s+([\d.]+)/.exec(line);
    if (startMatch) {
      currentStart = parseFloat(startMatch[1]);
    }
    
    const durationMatch = /silence_duration:\s+([\d.]+)/.exec(line);
    if (durationMatch) {
      const duration = parseFloat(durationMatch[1]);
      if (duration > maxSilenceDuration) {
        maxSilenceDuration = duration;
      }
      
      if (duration >= 1.0) {
        block = true;
      } else if (duration >= 0.3 && duration < 1.0) {
        warn = true;
        // Format time to MM:SS
        const minutes = Math.floor(currentStart / 60);
        const seconds = Math.floor(currentStart % 60);
        const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        warnings.push(`[🚨 Alerta QA: Silêncio de ${duration.toFixed(2)}s detectado no trecho ${timeStr}]`);
      }
    }
  }

  return {
    failed: block,
    warn,
    maxSilenceDuration,
    warnings
  };
}
