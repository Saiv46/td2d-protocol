const { Compiler } = require('protodef')
const { ProtoDefCompiler } = Compiler
const versions = require('../versions')

function compileProtocol (definition) {
  const compiler = new ProtoDefCompiler()
  compiler.addTypes({
    Read: {
      unimplemented: ['native', (buffer, offset) => ({
        value: buffer.slice(offset),
        size: buffer.length - offset
      })]
    },
    Write: {
      unimplemented: ['native', (value, buffer, offset) => value.copy(buffer, offset) + offset]
    },
    SizeOf: {
      unimplemented: ['native', (value) => value.length]
    }
  })
  compiler.addProtocol(definition, ['protocol'])
  return compiler.compileProtoDefSync()
}

module.exports = {}
for (const name in versions) {
  module.exports[name] = compileProtocol(versions[name].protocol)
}
