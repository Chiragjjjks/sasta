// Representative server-driven widget contract; prices are synthetic, not live Minutes evidence.
const http = require('http');
http.createServer((req,res)=>{
  if (req.method === 'OPTIONS') { res.writeHead(204,{'access-control-allow-origin':'*','access-control-allow-headers':'*'}); return res.end(); }
  let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{
    const send = (status,data) => {res.writeHead(status,{'content-type':'application/json','access-control-allow-origin':'*'});res.end(JSON.stringify(data));};
    if (req.method !== 'POST' || !req.url.startsWith('/api/4/page/fetch')) return send(501,{error:'Not modelled'});
    const body=JSON.parse(raw||'{}');
    if (!body.pageUri?.includes('marketplace=HYPERLOCAL') || body.locationContext?.pincode!==560010) return send(400,{error:'Missing Minutes scope or postcode'});
    const query=new URL(body.pageUri,'https://www.flipkart.com').searchParams.get('q');
    if (['401','403','429','503'].includes(query)) return send(+query,{error:'Provider failure fixture'});
    if (query==='location') return send(200,{RESPONSE:{pageMeta:{redirectionObject:{url:'/hyperlocal-preview-page?marketplace=HYPERLOCAL'}},slots:[]}});
    if (query==='retail') return send(200,{RESPONSE:{pageMeta:{marketplace:'FLIPKART'},slots:[]}});
    const product=(id,title,price,state='IN_STOCK',marketplace='HYPERLOCAL')=>({productInfo:{value:{id,titles:{title,subtitle:'80 g'},baseUrl:`/chips/p/${id}?pid=${id}&marketplace=${marketplace}`,pricing:{finalPrice:{value:price},prices:[{priceType:'MRP',value:40}]},availability:{displayState:state},productAction:{value:{enabled:state==='IN_STOCK'}}}}});
    return send(200,{RESPONSE:{pageMeta:{marketplace:'HYPERLOCAL'},slots:[{widget:{data:{products:[product('TEST1',"Lay's Classic Salted Potato Chips",30),product('TEST2','Bingo Masala Chips',25),product('TEST3',"Lay's Classic Salted Potato Chips",32,'OUT_OF_STOCK'),product('RETAIL',"Lay's Classic Salted Potato Chips",1,'IN_STOCK','FLIPKART')]}}}]}});
  });
}).listen(process.env.PORT);
