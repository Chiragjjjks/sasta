/* Run the actual self-contained production reader over HTTP, without replacing fetch. */
/* global __dirname */
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const ts = require('typescript')

function reader(file, name) {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(__dirname, '../src/core/adapters', file + '.ts'), 'utf8'), ts.ScriptTarget.Latest, true)
  const node = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name)
  return ts.transpileModule(node.getText(source).replace(/^export /, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
}
if (process.argv[2] === '--browser') {
  const name = process.argv[3] === 'amazon-now' ? 'readAmazonNowPage' : 'readZeptoPage'
  process.stdout.write(reader(process.argv[3] || 'zepto', name))
} else {
  const read = new Function(reader('flipkart', 'readFlipkartPage') + ';return readFlipkartPage')()
  ;(async () => {
    const endpoint = (process.env.SASTA_SIMULATION_URL || 'http://127.0.0.1:4955') + '/flipkart/api/4/page/fetch'
    const expected = { lays: 'products', location: 'needs_location', retail: 'unavailable', 401: 'needs_login', 403: 'blocked', 429: 'blocked', 503: 'unavailable' }
    for (const [q, kind] of Object.entries(expected)) {
      const result = await read(q, '560010', endpoint)
      assert.equal(result.kind, kind)
      if (q === 'lays') {
        assert.equal(result.products.length, 3)
        assert.equal(result.products[0].price, 30)
        assert.equal(result.products[2].inStock, false)
        assert.ok(result.products.every(p => new URL(p.url).searchParams.get('marketplace') === 'HYPERLOCAL'))
        assert.ok(!result.products.some(p => p.id === 'RETAIL'))
      }
    }
    console.log('PASS: production Flipkart reader over HTTP: price, stock, Minutes scope, location redirect, retail rejection, 401, 403, 429, 503.')
  })().catch(error => { console.error(error); process.exitCode = 1 })
}
