const { Transform } = require('node:stream')
const Protocol = require('../common/protocol')

const MinLength = 3

class UdpServerParser extends Transform {
  constructor (version, signal) {
    super({
      objectMode: true,
      signal
    })
    this.protocol = Protocol[version]
  }

  _transform ([buf, rinfo], _, callback) {
    if (buf.length < MinLength) return callback()
    try {
      callback(null, [this.protocol.read(buf, 0, 'udp_incoming').value, rinfo])
    } catch {}
  }
}

module.exports = UdpServerParser
