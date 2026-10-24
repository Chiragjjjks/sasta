/* Hermes does not retain executable Function#toString source by default. Generate WebView text at build time. */
/* global __dirname */
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const directory = path.join(__dirname, '../src/core/adapters')
const readers = [['bigbasket','readBigbasketPage'],['zepto','readZeptoPage'],['flipkart','readFlipkartPage'],['amazon-now','readAmazonNowPage']]
const generated = {}
for (const [file, name] of readers) {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(directory, file + '.ts'), 'utf8'), ts.ScriptTarget.Latest, true)
  const node = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name)
  generated[name] = ts.transpileModule(node.getText(source).replace(/^export /, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
}
const destination = path.join(directory, 'readers.generated.json')
const content = JSON.stringify(generated, null, 2) + '\n'
if (process.argv.includes('--check')) {
  if (!fs.existsSync(destination) || fs.readFileSync(destination, 'utf8') !== content) throw Error('Provider reader text is stale. Run npm run generate:readers.')
} else fs.writeFileSync(destination, content)
