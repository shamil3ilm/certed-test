// Wait for a TCP port to accept connections, then exit 0 (or 1 on timeout).
// Lets the second E2E webServer (marketing) start only AFTER the first (portal)
// has built + booted, so they share one `.next` build without a build race.
import net from 'node:net'

const port = Number(process.argv[2])
const deadline = Date.now() + 210_000

function check() {
  const socket = net.connect(port, '127.0.0.1')
  socket.once('connect', () => {
    socket.destroy()
    process.exit(0)
  })
  socket.once('error', () => {
    socket.destroy()
    if (Date.now() > deadline) process.exit(1)
    setTimeout(check, 1000)
  })
}

check()
