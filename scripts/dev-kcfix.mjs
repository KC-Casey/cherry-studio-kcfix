import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const cwd = fileURLToPath(new URL('../', import.meta.url))
const profile = fileURLToPath(new URL('../.context/kcfix-profile/', import.meta.url))
const child = spawn(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['dev'], {
  cwd,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, CS_DEV_PROFILE_ROOT: profile }
})
child.on('error', (error) => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
})
child.on('exit', (code) => {
  process.exitCode = code ?? 1
})
