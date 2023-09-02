const { Transform } = require('node:stream')
const Protocol = require('../common/protocol')

const Header = Buffer.from('\0')
const MinLength = Header.length + 1

class UdpClientParser extends Transform {
  constructor (version, signal) {
    super({
      readableObjectMode: true,
      signal
    })
    this.protocol = Protocol[version]
  }

  _transform (buf, _, callback) {
    if (buf.length < MinLength) return callback()
    try {
      if (buf.compare(Header, 0, Header.length) !== 0) return callback()
      callback(null, this.protocol.read(buf, Header.length, 'udp_outgoing').value)
    } catch (err) {
      callback(err)
    }
  }
}

module.exports = UdpClientParser
