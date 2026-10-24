const { readFileSync } = require('node:fs')
const { version } = require('../package.json')
const { expo } = require('../app.json')
const root = JSON.parse(readFileSync('../package.json', 'utf8'))
if (version !== expo.version || version !== root.version) throw new Error('App and package versions must agree')
const ref = process.argv[2]
if (ref?.startsWith('v') && ref !== `v${version}`) throw new Error(`Tag ${ref} does not match v${version}`)
console.log(`Sasta ${version}: versions match`)
