import { tavily } from '@tavily/core';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });
  const response = await tvly.search('Final da Copa do Mundo 2026', { searchDepth: 'advanced' });
  console.log(JSON.stringify(response, null, 2));
}
run().catch(console.error);
