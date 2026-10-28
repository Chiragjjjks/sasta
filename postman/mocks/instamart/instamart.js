// Synthetic values following the live search_products and get_addresses answers (checked 2026-10-28).
const http = require('http');
http.createServer((req, res) => {
  let raw = ''; req.on('data', c => raw += c); req.on('end', () => {
    const send = (status, value) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (req.method === 'POST' && req.url === '/auth/token') {
      if (req.headers['content-type'] !== 'application/json') return send(415, { error: 'JSON required' });
      const tokenRequest = JSON.parse(raw);
      if (!['authorization_code','refresh_token'].includes(tokenRequest.grant_type)) return send(400, { error: 'Invalid grant' });
      return send(200, { access_token: 'simulation-only', refresh_token: 'simulation-refresh', expires_in: 3600 });
    }
    if (req.method !== 'POST' || req.url !== '/im') return send(501, { error: 'Not modelled' });
    const body = JSON.parse(raw);
    if (req.headers.authorization !== 'Bearer simulation-only') return send(401, { error: 'Authentication required' });
    if (body.method === 'initialize') return send(200, { jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } } });
    if (body.method === 'notifications/initialized') { res.writeHead(202); return res.end(); }
    if (body.method !== 'tools/call' || !['search_products', 'get_addresses'].includes(body.params?.name)) return send(501, { error: 'Not modelled' });
    const args = body.params.arguments;
    // Live behaviour (2026-10-28): signed-in sessions must name a saved address; guest coordinates are refused.
    if (body.params.name === 'get_addresses') return send(200, { jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: '1 address' }], structuredContent: {
      addresses: [{ id: 'fixture-home', addressLine: 'Synthetic address', addressCategory: 'Home', addressTag: 'Home' }], total: 1,
      resolution: { resolutionSource: 'ranked_saved_address', needsUserClarification: false, candidateAddressIds: ['fixture-home'], defaultAddressId: 'fixture-home' } } } });
    if (!args.addressId) return send(200, { jsonrpc: '2.0', id: body.id, result: { isError: true, content: [{ type: 'text', text: 'addressId is required' }], structuredContent: { success: false, error: { message: 'addressId is required' } } } });
    if (args.addressId !== 'fixture-home') return send(400, { error: 'Invented address' });
    if (['401','403','429','503'].includes(args.query)) return send(+args.query, { error: 'Failure fixture' });
    if (args.query === 'hang') return;
    if (args.query === 'html') { res.writeHead(502, { 'content-type': 'text/html' }); return res.end('<h1>Gateway error</h1>'); }
    const variant = (id, pack, price, stock) => ({ skuId: id, spinId: id, displayName: 'Milk', quantityDescription: pack, price: { mrp: price + 5, offerPrice: price }, isInStockAndAvailable: stock });
    const payload = args.query === 'error' ? { success: false, error: { message: 'Unavailable' } }
      : args.query === 'malformed' ? { products: {} }
      : { nextOffset: '1', products: [{ displayName: 'Milk', brand: 'Example', inStock: true, isAvail: true, variations: [variant('one','500 ml',24,true),variant('two','1 L',48,false)] }] };
    return send(200, { jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: 'Found products' }], structuredContent: payload, ...(payload.success === false ? { isError: true } : {}) } });
  });
}).listen(process.env.PORT);
