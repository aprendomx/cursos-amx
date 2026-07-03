import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'

export default function globalSetup() {
  if (!existsSync('dist/index.html')) {
    console.log('Building production bundle for performance tests...')
    execSync('npm run build', { stdio: 'inherit' })
  }
}
