const { Transform } = require('node:stream')
const Protocol = require('./protocol')

const Header100 = Buffer.from('hPKT\0')

class TcpPacketParser extends Transform {
  constructor (version, signal) {
    super({
      readableObjectMode: true,
      signal
    })
    this.protocol = Protocol[version]
    this.useHeader = version === 100
    this.buffer = Buffer.allocUnsafe(0)
  }

  _transform (chunk, _, callback) {
    this.buffer = Buffer.concat([this.buffer, chunk])
    let index = 0
    let slice = 0
    try {
      while (true) {
        if (this.buffer.length < index) break
        if (this.useHeader && this.buffer.compare(Header100, 0, Header100.length, index, index += Header100.length) !== 0) {
          this.buffer = Buffer.allocUnsafe(0)
          break
        }
        const length = this.buffer.readUInt8(index++)
        if (this.buffer.length < index + length) break
        try {
          const packet = this.protocol.read(this.buffer, index, 'tcp_packet').value
          slice = index + length
          index += length
          if (!this.push(packet)) break
        } catch {}
      }
      callback()
    } catch (err) {
      callback(err)
    }
    this.buffer = this.buffer.subarray(slice)
  }
}

module.exports = TcpPacketParser
