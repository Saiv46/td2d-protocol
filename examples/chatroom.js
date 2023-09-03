const { once } = require('node:events')
const { createServer } = require('..')
const GameTimers = require('../src/common/gameTimers')
const { passthroughHandler, otherClients, validateIdentity } = require('./_common')
const version = 100

async function main () {
  // Connection
  const server = await createServer({ version })
  console.log('Server running!')

  server.on('connection', async client => {
    const { clientId } = client
    const [identity] = await once(client, 'ClientIdentity')
    identity.clientId = clientId
    client.identity = identity
    client.once('error', err => {
      client.write('ServerDisconnectReason', err?.message ?? '')
      client.destroy(err)
    })
    if (!validateIdentity(server, client)) return

    console.log(identity.username, 'joined!')
    client.write('ServerStatus', { clientId, isLobby: true })
    client.write('ServerSetEXEChance', 100)
    for (const client2 of otherClients(server, client)) {
      client2.write('ServerPlayerJoined', clientId)
      client2.write('ServerPlayerInfo', client.identity)
    }
    server.broadcast('PassthroughChatMessage', { message: `\`${identity.username} \`joined` })
    client.once('ClientPlayerInfoRequest', () => {
      for (const client2 of otherClients(server, client)) {
        client.write('ServerPlayerInfoResponse', client2.identity)
      }
      client.write('ServerLobbyLoaded')
      client.write('PassthroughChatMessage', { clientId: 0, message: 'welcome to chatroom' })
    })
    client.on('PassthroughChatMessage', data => {
      if (data.sender !== client.clientId) return
      console.log(identity.username, ':', data.message)
      for (const client2 of otherClients(server, client)) {
        client2.write('PassthroughChatMessage', data)
      }
    })
    client.on('ClientLobbyReady', isReady => {
      client.identity.isReady = isReady
      server.broadcast('ServerReadyState', { clientId, isReady })
    })
    client.on('data', passthroughHandler.bind(null, server, client))
    client.once('close', () => {
      server.broadcast('ServerPlayerLeft', clientId)
      server.broadcast('PassthroughChatMessage', { message: `\`${identity.username} \`left` })
    })
  })

  setInterval(() => server.broadcast('ServerHeartbeat'), 2 * GameTimers.Second)
  process.once('SIGINT', () => {
    console.log('Shutting down')
    server.broadcast('ServerDisconnectReason', 'Server shutdown')
    server.destroy()
  })
  server.once('close', () => process.exit(1))
}

main().catch(console.trace)
