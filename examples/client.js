const { once } = require('node:events')
const { createConnection, Enums } = require('..')
const version = 1014

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

  let helloAnswer
  if (version > 100) {
    const [{ token }] = await once(bot, 'ServerHello')
    // I have no fucking idea how this works
    const i3 = token[2]
    let o1 = i3, o3 = i3
    if (i3 & 0x0200) {
//      o1 = i3 + 0xA77EF8F2
//      o3 = i3 + 0xDE3338D7
    }
    if (i3 & 0x04000000) {
//      o1 = i3 + 0x0F18
//      o3 = i3 + 0x0E01
    }
    if (i3 & 0x80000000) {
//      o1 = i3 + 0x0AB0
//      o3 = i3 + 0x0A3A
    }
    helloAnswer = [o1, 0, o3, 0]
  }

  // Identification
  bot.write('ClientIdentity', {
    version,
    username: 'saivbot',
    icon: Enums[version].icons.byName.PowerUp,
    pet: Enums[version].pets.byName.Xato,
    os: Enums[version].os.byName.Linux,
    uuid: 'saivbot',
    token: helloAnswer
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
