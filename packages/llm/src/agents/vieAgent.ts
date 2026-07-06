import { 
  Script, 
  ChannelVisualDNA, 
  RenderManifest, 
  VisualIdentityEngine 
} from '@cos/types';
import { LLMProvider } from '../index.js';

export class VisualIdentityEngineAgent implements VisualIdentityEngine {
  constructor(private llm: LLMProvider) {}

  async generateManifest(
    script: Script,
    mediaAssets: Record<string, string>,
    channelDna: ChannelVisualDNA
  ): Promise<RenderManifest> {
    
    const systemPrompt = `
You are the Visual Identity Engine (VIE), acting as an expert Art Director for the COS platform.
Your mission is to answer: "If this specific content were produced by this channel, how should it look and feel?"

You will receive:
1. The Channel's Visual DNA (Semantic rules for typography, motion, branding, layout, audio, platform, and storytelling).
2. The Script (The content sections to be presented).
3. Available Media Assets (e.g., generated images, b-rolls, URLs).

Your job is to translate these semantic intents into a strict, technical JSON \`RenderManifest\` that our Render Engine (Remotion) will execute.

The DNA provides the *Why*. You provide the *How*.
- For example, if the DNA pacing is "anxious-and-fast", your manifest scenes should have short durations, aggressive transitions like "glitch", and high-energy caption styles.
- If the typography tone is "elegant-and-subtle", you should select serif fonts, smaller base font sizes, and smooth fade transitions.
- Structure the globalStyle and audioContext dynamically based on the DNA.

Return ONLY a valid JSON object matching the RenderManifest TypeScript interface. Do not include markdown formatting or extra text.
    `;

    const userPrompt = `
--- CHANNEL VISUAL DNA ---
${JSON.stringify(channelDna, null, 2)}

--- SCRIPT ---
${JSON.stringify(script, null, 2)}

--- MEDIA ASSETS ---
${JSON.stringify(mediaAssets, null, 2)}

Generate the RenderManifest JSON matching the exact TypeScript interface:
`;

    const response = await this.llm.complete(userPrompt, {
      systemPrompt,
      jsonMode: true,
      temperature: 0.7,
    });

    try {
      const manifest: RenderManifest = JSON.parse(response);
      
      // Ensure basic required fields exist if the LLM hallucinated
      manifest.videoId = manifest.videoId || `vie-${Date.now()}`;
      
      return manifest;
    } catch (e) {
      console.error("Failed to parse VIE RenderManifest JSON:", response);
      throw new Error("VIE failed to generate a valid JSON RenderManifest");
    }
  }
}
