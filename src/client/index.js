const assert = require('node:assert/strict')
const { lookup } = require('node:dns/promises')
const Client = require('./client')

async function createConnection (options = {}) {
  assert(options.host, 'options.host required')
  {
    const { address, family } = await lookup(options.host)
    options.host = address
    options.legacyIP = family === 4
  }
  const client = new Client(options)
  try {
    await client.connect()
    client.logger('Connected')
  } catch (err) {
    client.logger('Failed to connect due to', err)
    throw err
  }
  return client
}

module.exports = {
  Client,
  createConnection
}
