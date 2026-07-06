async function main() {
  const url = 'http://localhost:3000/api/inject';
  const body = {
    channelId: '8fa92795-81e3-4fe8-9b31-422b828812f6',
    topic: 'Dominando Typescript e Arquitetura no COS'
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  console.log('API RESPONSE:', data);
}

main().catch(console.error);
