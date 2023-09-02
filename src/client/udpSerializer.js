const { Transform } = require('node:stream')
const Protocol = require('../common/protocol')

class UdpClientSerializer extends Transform {
  constructor (version, signal) {
    super({
      writableObjectMode: true,
      signal
    })
    this.protocol = Protocol[version]
  }

  _transform (packet, _, callback) {
    try {
      const length = this.protocol.sizeOf(packet, 'udp_incoming')
      const buffer = Buffer.allocUnsafe(length)
      this.protocol.write(packet, buffer, 0, 'udp_incoming')
      callback(null, buffer)
    } catch (err) {
      callback(err)
    }
  }
}

module.exports = UdpClientSerializer
