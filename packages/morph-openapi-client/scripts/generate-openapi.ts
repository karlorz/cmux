import { createClient } from '@hey-api/openapi-ts'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SPEC_URL = 'https://cloud.morph.so/api/openapi.json'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(__dirname, '..')
const outputPath = path.join(pkgRoot, 'src/client')
const tsConfigPath = path.join(pkgRoot, 'tsconfig.json')

const tmpSpecPath = path.join(
  os.tmpdir(),
  `morph-openapi-${process.pid}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.json`
)

console.time('morph-openapi:fetch-spec')
const response = await fetch(SPEC_URL)
console.timeEnd('morph-openapi:fetch-spec')

if (!response.ok) {
  throw new Error(`Failed to download Morph Cloud spec (${response.status})`)
}

fs.writeFileSync(tmpSpecPath, await response.text())
fs.mkdirSync(outputPath, { recursive: true })

console.time('morph-openapi:generate-client')
await createClient({
  input: tmpSpecPath,
  output: {
    path: outputPath,
    tsConfigPath,
  },
  plugins: ['@hey-api/client-fetch', '@hey-api/typescript'],
})
console.timeEnd('morph-openapi:generate-client')

try {
  fs.rmSync(tmpSpecPath)
} catch {
  // ignore
}

console.log('[morph-openapi] client generation complete')
