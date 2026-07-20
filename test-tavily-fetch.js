import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
  if (!TAVILY_API_KEY) {
    console.error('No TAVILY_API_KEY found');
    return;
  }
  const searchResponse = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: TAVILY_API_KEY,
      query: 'Final da Copa do Mundo 2026',
      search_depth: 'advanced',
      include_answer: true,
      max_results: 5,
    }),
  });
  if (searchResponse.ok) {
    const data = await searchResponse.json();
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.error(`Status: ${searchResponse.status}`);
    const text = await searchResponse.text();
    console.error(text);
  }
}
run().catch(console.error);
