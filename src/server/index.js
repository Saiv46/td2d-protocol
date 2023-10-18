const { lookup } = require('node:dns/promises')
const Server = require('./server')

async function createServer (options = {}) {
  if (options.host) {
    const { address, family } = await lookup(options.host)
    options.host = address
    options.legacyIP = family === 4
  }
  const server = new Server(options)
  try {
    await server.listen()
    server.logger('Successfully started')
  } catch (err) {
    server.logger('Failed to listen due to', err)
    throw err
  }
  return server
}

module.exports = {
  Server,
  createServer
}
