const { VersionData } = require('..')
const { protocol: { types: packetDefinition } } = VersionData[100].protocol

console.log(`Packet naming convention:
- Server* - Client-bound packets
- Client* - Server-bound packets
- Passthrough* - Client-to-client packets (sent with "passthrough: true")
- Unused* - Unused or packets with unknown structure (DO NOT USE)

`)

function describeType (typeDef) {
  if (typeof typeDef === 'string') return typeDef
  if (!Array.isArray(typeDef)) return typeDef
  const [type, opts] = typeDef
  switch (type) {
    case 'array': return `${opts.type}[${opts.count ?? opts.countType}]`
    case 'mapper': return `[${opts.type}]\n` + Object.entries(opts.mappings).map(([k, v]) => `* ${k} -> ${v}`).join('\n')
    case 'switch': {
      let str = ''
      const { compareTo, fields } = opts
      for (const key in fields) {
        str += `\n[${compareTo} == ${key}] ${describeType(fields[key]).split('\n').map(v => '  ' + v).join('\n')}`
      }
      return str
    }
    case 'container': {
      let str = ''
      for (const { anon, name, type: fieldType } of opts) {
        const desc = describeType(fieldType)
        if (desc.includes('\n')) {
          str += `\n- ${anon ? '(anonymous)' : name} ${desc.split('\n').map(v => '  ' + v).join('\n')}`
        } else {
          str += `\n- ${name} (${desc})`
        }
      }
      return str
    }
  }
}

for (let packetName in packetDefinition) {
  const type = describeType(packetDefinition[packetName])
  if (packetName.includes('__')) {
    const [proto, name] = packetName.split('__')
    packetName = `[${proto.toUpperCase()}] ${name}`
  }
  console.log(packetName, ':', type)
  console.log('')
}
