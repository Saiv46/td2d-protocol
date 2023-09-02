const version = 100
const { Client, Enums: { [version]: Enums } } = require('..')
let active = 0
let completed = 0
let failed = 0

setInterval(() => {
  console.log(
    'Active: %d/s | Failed: %d/s | Completed: %d/s',
    active, failed, completed
  )
  failed = 0
  completed = 0
}, 1000)

const onError = () => { failed++ }
const onConnectFail = () => { active--; failed++ }
const onCompleted = () => { completed++ }
function createClient () {
  active++
  const client = new Client({
    version,
    host: '::1',
    portTcp: 7606,
    portUdp: 8606
  })
  client.connect().then(() => {
    client.write('ClientIdentity', {
      version,
      username: 'saivbot' + Math.random(),
      icon: Enums.icons.byId.at(Math.random() * Enums.icons.length | 0),
      pet: Enums.pets.byId.at(Math.random() * Enums.pets.length | 0),
      os: Enums.os.byId.at(Math.random() * Enums.os.length | 0),
      uuid: 'saivbot' + Math.random()
    })
    client.once('ServerStatus', ({ clientId }) => {
      client.write('PassthroughChatMessage', { sender: clientId, message: 'hello world!' }, true)
      completed++
      client.destroy()
    })
    client.once('error', onError)
    client.once('close', onCompleted)
  }, onConnectFail)
}

setInterval(() => queueMicrotask(createClient), 0)
