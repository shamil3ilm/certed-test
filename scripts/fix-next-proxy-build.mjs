import { copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const serverDir = join(process.cwd(), '.next', 'server')
const middlewareJs = join(serverDir, 'middleware.js')
const middlewareNft = join(serverDir, 'middleware.js.nft.json')
const proxyJs = join(serverDir, 'proxy.js')
const proxyNft = join(serverDir, 'proxy.js.nft.json')

if (existsSync(middlewareJs) && !existsSync(proxyJs)) {
  copyFileSync(middlewareJs, proxyJs)
}

if (existsSync(middlewareNft) && !existsSync(proxyNft)) {
  copyFileSync(middlewareNft, proxyNft)
}
