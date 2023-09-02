const { Transform } = require('node:stream')
const Protocol = require('../common/protocol')

class UdpServerSerializer extends Transform {
  constructor (version, signal) {
    super({
      readableObjectMode: true,
      signal
    })
    this.protocol = Protocol[version]
  }

  _transform ([packet, rinfo], _, callback) {
    try {
      const length = this.protocol.sizeOf(packet, 'udp_outgoing')
      const buffer = Buffer.allocUnsafe(length + 1)
      this.protocol.write(packet, buffer, 1, 'udp_outgoing')
      callback(null, [buffer, rinfo])
    } catch (err) {
      callback(err)
    }
  }
}

module.exports = UdpServerSerializer
