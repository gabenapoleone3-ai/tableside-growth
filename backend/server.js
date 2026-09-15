import http from 'node:http';
const PORT = Number(process.env.PORT || 3000);
function json(res, status, data) { res.writeHead(status, {'Content-Type':'application/json'}); res.end(JSON.stringify(data)); }
const server = http.createServer((req,res) => {
  res.setHeader('Access-Control-Allow-Origin','https://gabenapoleone3-ai.github.io');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if (req.method === 'OPTIONS') return res.writeHead(204).end();
  if (req.method === 'GET' && req.url === '/health') return json(res,200,{ok:true,service:'tableside-growth-ai'});
  return json(res,404,{error:'Not found'});
});
server.listen(PORT,'0.0.0.0',()=>console.log(`TableSide Growth AI backend listening on ${PORT}`));
