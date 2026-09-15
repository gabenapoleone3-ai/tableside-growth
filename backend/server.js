import http from 'node:http';

const PORT = Number(process.env.PORT || 3000);
const ORIGIN = 'https://gabenapoleone3-ai.github.io';

function json(res, status, data) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8'});
  res.end(JSON.stringify(data));
}

async function bodyJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 16000) throw new Error('Request too large');
  }
  return raw ? JSON.parse(raw) : {};
}

const text = (value, max) => String(value || '').trim().slice(0, max);

async function generateDraft(input) {
  if (!process.env.OPENAI_API_KEY) throw new Error('AI service is not configured');
  const prospect = {
    businessName: text(input.businessName, 160),
    city: text(input.city, 120),
    website: text(input.website, 500),
    instagram: text(input.instagram, 250),
    notes: text(input.notes, 2000)
  };
  if (!prospect.businessName) throw new Error('Business name is required');

  const prompt = [
    'Write a concise legitimate first-contact email for TableSide Growth.',
    'Offer a short free customer-growth audit.',
    'Use only the prospect facts supplied below; never invent facts, results, urgency, guarantees, or claims that something was reviewed when it was not.',
    'Keep it natural, professional, non-pushy, and under 130 words.',
    'Sign the email: Gabe, TableSide Growth.',
    'Return ONLY valid JSON with exactly two string fields: subject and body.',
    `Prospect: ${JSON.stringify(prospect)}`
  ].join('\n');

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
      store: false,
      input: prompt
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || 'AI request failed');
  const output = data.output_text || (data.output || []).flatMap(x => x.content || []).find(x => x.type === 'output_text')?.text;
  if (!output) throw new Error('AI returned no draft');
  const cleaned = output.replace(/^```json\s*/i, '').replace(/\s*```$/,'').trim();
  const draft = JSON.parse(cleaned);
  return {subject:text(draft.subject,180), body:text(draft.body,4000)};
}

const server = http.createServer(async (req,res) => {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if (req.method === 'OPTIONS') return res.writeHead(204).end();
  if (req.method === 'GET' && req.url === '/health') return json(res,200,{ok:true,service:'tableside-growth-ai',aiConfigured:Boolean(process.env.OPENAI_API_KEY)});
  if (req.method === 'POST' && req.url === '/api/generate-draft') {
    try {
      const input = await bodyJson(req);
      return json(res,200,await generateDraft(input));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed';
      return json(res,/required|large|JSON/i.test(message)?400:500,{error:message});
    }
  }
  return json(res,404,{error:'Not found'});
});

server.listen(PORT,'0.0.0.0',()=>console.log(`TableSide Growth AI backend listening on ${PORT}`));
