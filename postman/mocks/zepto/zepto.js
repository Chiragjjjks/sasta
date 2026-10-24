// Public product fields captured from Zepto, rendered with its observed DOM contract.
const http = require('http');
const fs = require('fs');
const path = require('path');
const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../mobile/fixtures/zepto/lays.json'), 'utf8'));
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
http.createServer((req,res)=>{
  if (!req.url.startsWith('/search')) { res.writeHead(501); return res.end('Not modelled'); }
  const mode = new URL(req.url,'http://localhost').searchParams.get('mode');
  let html = '<!doctype html><title>Zepto contract fixture</title>';
  if (mode !== 'location') html += `<script>localStorage.setItem('user-position',JSON.stringify({state:{userPosition:{latitude:${fixture.location.lat},longitude:${fixture.location.lng}}}}))</script>`;
  else html += "<script>localStorage.removeItem('user-position')</script>Select location";
  if (mode === 'login') html += 'Please login';
  else if (mode === 'blocked') html += 'Verify you are human';
  else if (mode !== 'location') html += fixture.products.map(p => `<a data-testid="product-card" href="${esc(p.url)}"><img alt="${esc(p.title)}" src="${esc(p.imageUrl||'')}"><span data-slot-id="ProductName">${esc(p.title)}</span><span data-slot-id="PackSize">${esc(p.packLabel||'')}</span><span data-slot-id="EdlpPrice"><span>₹${p.price}</span><span>₹${p.mrp||p.price}</span></span><span data-is-out-of-stock="${!p.inStock}"></span></a>`).join('');
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'}); res.end(html);
}).listen(process.env.PORT);
