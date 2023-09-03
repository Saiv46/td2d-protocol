const { Enums } = require('..')
const assert = require('node:assert/strict')

function passthroughHandler (server, client, packet) {
  if (packet.passthrough && client.listenerCount(packet.type) === 0) {
    for (const client2 of otherClients(server, client)) {
      client2.write(packet.type, packet.data)
    }
  }
}

function * otherClients (server, exception = null) {
  for (const client of server.clients.values()) {
    if (client !== exception && client.identity) yield client
  }
}

function validateIdentity (server, client) {
  const { version} = server.options
  const { identity } = client
  try {
    assert.strictEqual(identity.version, version, 'incompatible version')
    assert(Enums[version].icons.hasId(identity.icon), 'unknown icon')
    assert(Enums[version].pets.hasId(identity.pet), 'unknown pet')
    assert(Enums[version].os.hasId(identity.os), 'unknown os')
    identity.username = normalizeUsername(identity.username).substring(0, 16)
    assert(identity.username.length > 0, 'username required')
    identity.uuid = identity.uuid.trim()
    assert(identity.uuid.length > 0, 'uuid required')
    for (const client2 of otherClients(server, client)) {
      if (client2.identity.uuid === identity.uuid) client2.destroy('Only one client allowed per UUID')
    }
    return true
  } catch (err) {
    client.emit('error', err)
    return false
  }
}

function normalizeUsername (username) {
  return username.replaceAll(/[^a-zа-я0-9 \\№;`@/&~|]+/g, '').replaceAll(/[ \\№;`@/&~|]{2,}/g, m => m.at(-1)).trim()
}

module.exports = { passthroughHandler, otherClients, validateIdentity, normalizeUsername }
