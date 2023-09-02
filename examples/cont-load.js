const version = 100
const { Client, Enums: { [version]: Enums } } = require('..')

const ClientsPerMinute = 100

let failed = 0
const clients = new Set()
const connecting = new Set()
setInterval(() => {
  console.log('Active: %d | Failed: %d | Connecting: %d', clients.size, failed, connecting.size)
  failed = 0
}, 1000)

const onFail = () => { failed++ }
function createClient () {
  const client = new Client({
    version,
    host: '::1',
    portTcp: 7606,
    portUdp: 8606
  })
  connecting.add(client)
  client.connect().then(() => {
    clients.add(client)
    client.write('ClientIdentity', {
      version,
      username: 'saivbot' + Math.random(),
      icon: Enums.icons.byId.at(Math.random() * Enums.icons.length | 0),
      pet: Enums.pets.byId.at(Math.random() * Enums.pets.length | 0),
      os: Enums.os.byId.at(Math.random() * Enums.os.length | 0),
      uuid: 'saivbot' + Math.random()
    })
    client.once('ServerStatus', ({ clientId }) => { client.clientId = clientId })
    client.once('error', onFail)
    client.once('close', () => clients.delete(client))
  }, onFail).finally(() => connecting.delete(client))
}

const startTime = Date.now()
setInterval(() => {
  const players = Math.floor((Date.now() - startTime) / 60000 * ClientsPerMinute)
  while (connecting.size + clients.size + failed < players) createClient()
  for (const client of clients) {
    client.writeUdp('ClientPlayerState', {
      clientId: client.clientId,
      x: Math.random(),
      y: Math.random(),
      additional: Buffer.allocUnsafe(0)
    })
    client.write('PassthroughChatMessage', { clientId: client.clientId, message: 'hello world' }, true)
  }
}, 15)
