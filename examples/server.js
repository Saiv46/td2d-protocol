const { once } = require('node:events')
const { createServer, Enums } = require('..')
const assert = require('node:assert/strict')
const GameTimers = require('../src/common/gameTimers')
const version = 100

async function main () {
  // Connection
  const server = await createServer({ version })
  console.log('Server running!')

  server.on('connection', async client => {
    console.log('Client #%d connected!', client.clientId)
    const [identity] = await once(client, 'ClientIdentity')
    try {
      assert.strictEqual(identity.version, version)
      assert(Enums[version].icons.hasId(identity.icon), 'unknown icon')
      assert(Enums[version].pets.hasId(identity.pet), 'unknown pet')
      assert(Enums[version].os.hasId(identity.os), 'unknown os')
    } catch (err) {
      console.log('Disconnected due to', err)
      return client.destroy()
    }
    console.log(identity.username, 'joined!')
    client.write('ServerStatus', { clientId: client.clientId, isLobby: true })
    client.on('data', packet => {
      if (packet.passthrough) {
        for (const client of server.clients.values()) {
          client.write(packet.type, packet.data)
        }
      }
    })
    client.on('PassthroughChatMessage', ({ message }) => console.log(identity.username, ':', message))
  })

  setInterval(() => {
    for (const client of server.clients.values()) {
      client.write('ServerHeartbeat')
    }
  }, 2 * GameTimers.Second)
}

main().catch(err => console.trace(err))
