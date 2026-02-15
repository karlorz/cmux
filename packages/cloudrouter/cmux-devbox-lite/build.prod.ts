import 'dotenv/config'
import { Template, defaultBuildLogger } from 'e2b'
import { template } from './template'

async function main() {
  const apiKey = process.env.E2B_API_KEY
  if (!apiKey) {
    console.error('E2B_API_KEY not set')
    process.exit(1)
  }

  console.log('Building E2B template: cmux-devbox-lite')

  const result = await Template.build(template, 'cmux-devbox-lite', {
    apiKey,
    onBuildLogs: defaultBuildLogger(),
  })

  console.log('\nTemplate built successfully!')
  console.log('Template ID:', result.templateId)

  // Output for script parsing
  console.log('\n__TEMPLATE_ID__=' + result.templateId)
}

main().catch((err) => {
  console.error('Build failed:', err.message)
  process.exit(1)
})
