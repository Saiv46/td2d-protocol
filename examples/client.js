const { once } = require('node:events')
const { createConnection, Enums } = require('..')
const version = 101

if (!process.env.DEBUG) {
  console.log('🛈 Try running this with environment variable set as DEBUG=*')
}

async function main () {
  // Connection
  const bot = await createConnection({
    version,
    host: process.env.HOST ?? 'localhost',
    portTcp: 7606,
    portUdp: 8606
  })
  console.log('Bot connected!')

  let helloPacket
  if (version > 100) {
    helloPacket = await once(bot, 'ServerHello')
  }

  // Identification
  bot.write('ClientIdentity', {
    version,
    username: 'saivbot',
    icon: Enums[version].icons.byName.PowerUp,
    pet: Enums[version].pets.byName.Xato,
    os: Enums[version].os.byName.Linux,
    uuid: 'saivbot',
    unknown2: helloPacket[0].unknown
  })
  bot.once('ServerDisconnectReason', reason => console.error('Disconnect reason:', reason))
  const [{ clientId, isLobby }] = await once(bot, 'ServerStatus')
  bot.clientId = clientId
  console.log('Bot joined!')

  // Custom code
  if (isLobby) {
    bot.write('PassthroughChatMessage', { sender: clientId, message: 'hello world!' }, true)
    console.log('Sent message')
  }

  bot.destroy()
  await once(bot, 'close')
  console.log('Disconnected')
}

main().catch(err => console.trace(err))
