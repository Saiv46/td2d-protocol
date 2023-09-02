const { lookup } = require('node:dns/promises')
const Server = require('./server')

async function createServer (options = {}) {
  if (options.host) {
    const { address, family } = await lookup(options.host)
    options.host = address
    options.legacyIP = family === 4
  }
  const server = new Server(options)
  await server.listen()
  return server
}

module.exports = {
  Server,
  createServer
}
