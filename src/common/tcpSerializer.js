const { Transform } = require('node:stream')
const Protocol = require('./protocol')

const Header = Buffer.from('hPKT\0')
const HeaderLen = Header.length + 1

class TcpPacketSerializer extends Transform {
  constructor (version, signal) {
    super({
      writableObjectMode: true,
      signal
    })
    this.protocol = Protocol[version]
  }

  _serialize (packet) {
    const size = this.protocol.sizeOf(packet, 'tcp_packet')
    const buffer = Buffer.allocUnsafe(HeaderLen + size)
    buffer.writeUInt8(size, Header.copy(buffer))
    this.protocol.write(packet, buffer, HeaderLen, 'tcp_packet')
    return buffer
  }

  _transform (packet, _, callback) {
    try {
      callback(null, this._serialize(packet))
    } catch (err) {
      callback(err)
    }
  }
}

module.exports = TcpPacketSerializer
