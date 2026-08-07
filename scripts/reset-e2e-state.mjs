import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

rmSync(join(root, '.mock-db.json'), { force: true })

const staleLock = join(root, '.next', 'lock')
if (existsSync(staleLock)) {
  rmSync(staleLock, { force: true })
}
