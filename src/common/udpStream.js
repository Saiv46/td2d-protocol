const assert = require('node:assert')
const { createSocket } = require('node:dgram')
const { Duplex } = require('node:stream')
const dnsLookupNoop = require('./dnsNoop')

const kSocket = Symbol('socket')
const kPort = Symbol('port')
const kHost = Symbol('host')

class UdpSocket extends Duplex {
  constructor (options) {
    assert(Number.isSafeInteger(options.port), 'options.port must be integer')
    assert(options.family, 'options.family must be 4 or 6')
    super(options)
    this[kPort] = options.port
    this[kHost] = options.host
    this[kSocket] = createSocket({
      type: 'udp' + options.family,
      lookup: dnsLookupNoop(options.family),
      signal: options.signal
    })
    this[kSocket].once('error', this.destroy.bind(this))
    this[kSocket].once('close', this.destroy.bind(this))
  }

  _read () {}

  _destroy (err, callback) {
    this[kSocket].unref()
    this[kSocket].close(callback.bind(this, err))
  }
}

class UdpClient extends UdpSocket {
  _construct (callback) {
    this[kSocket].unref()
    this[kSocket].on('message', msg => this.push(msg))
    this[kSocket].once('connect', this.emit.bind(this, 'connect'))
    this[kSocket].connect(this[kPort], this[kHost], callback)
  }

  _write (chunk, _, callback) {
    try {
      this[kSocket].send(chunk, callback)
    } catch (err) {
      callback(err)
    }
  }
}

class UdpServer extends UdpSocket {
  constructor (options) {
    super({ objectMode: true, ...options })
  }

  _construct (callback) {
    this[kSocket].on('message', (msg, rinfo) => this.push([msg, rinfo]))
    this[kSocket].once('listening', () => this.emit('listening'))
    this[kSocket].bind(this[kPort], this[kHost], callback)
  }

  _write ([msg, rinfo], _, callback) {
    try {
      this[kSocket].send(msg, rinfo.port, rinfo.address, callback)
    } catch (err) {
      callback(err)
    }
  }
}

UdpSocket.Client = UdpClient
UdpSocket.Server = UdpServer
module.exports = UdpSocket
