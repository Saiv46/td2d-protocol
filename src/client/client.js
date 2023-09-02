const { EventEmitter, once } = require('node:events')
const { createConnection } = require('node:net')
const dnsLookupNoop = require('../common/dnsNoop')
const UdpSocket = require('../common/udpStream')
const TcpPacketParser = require('../common/tcpParser')
const TcpPacketSerializer = require('../common/tcpSerializer')
const UdpClientParser = require('./udpParser')
const UdpClientSerializer = require('./udpSerializer')
const GameTimers = require('../common/gameTimers')

// Events:
// - error (error: Error)
// - close (error: AbortError)
// - [PacketType] (data: any, passthrough: boolean)
// - data (packet: Packet)
// - write (packet: Packet)

class Client extends EventEmitter {
  static DefaultOptions = {
    legacyIP: false,
    version: 100,
    portTcp: 7606,
    portUdp: 8606,
    timeout: 4 * GameTimers.Second, // Server sends heartbeat every 2s
    abortController: null
  }

  constructor (options) {
    super({ captureRejections: true })
    this.options = Object.assign({}, Client.DefaultOptions, options)
    this.abortController = this.options.abortController ?? new AbortController()
    this.clientId = 0
    this.tcpSocket = null
    this.udpSocket = null

    const { version } = this.options
    const { signal } = this.abortController
    this.tcpParser = new TcpPacketParser(version, signal)
    this.tcpSerializer = new TcpPacketSerializer(version, signal)
    this.udpParser = new UdpClientParser(version, signal)
    this.udpSerializer = new UdpClientSerializer(version, signal)

    this.tcpParser.on('data', this.emit.bind(this, 'data'))
    this.udpParser.on('data', this.emit.bind(this, 'data'))
    this.tcpParser.on('error', this._errorHandler.bind(this))
    this.tcpSerializer.on('error', this._errorHandler.bind(this))
    this.udpParser.on('error', this._errorHandler.bind(this))
    this.udpSerializer.on('error', this._errorHandler.bind(this))
    signal.addEventListener('abort', () => this.emit('close', signal.reason.cause))
    this.on('data', packet => this.emit(packet.type, packet.data, packet.passthrough))
  }

  async connect () {
    await Promise.all([
      this.tcpConnect(),
      this.udpConnect()
    ])
  }

  async tcpConnect () {
    this.tcpSocket = createConnection({
      port: this.options.portTcp,
      host: this.options.host,
      lookup: dnsLookupNoop(this.options.legacyIP ? 4 : 6),
      noDelay: true,
      keepAlive: true,
      signal: this.abortController.signal
    })
    this.tcpSocket.setTimeout(this.options.timeout)
    const [error] = await Promise.race([
      once(this.tcpSocket, 'connect'),
      once(this.tcpSocket, 'error'),
      once(this.tcpSocket, 'timeout').then(() => [new Error('Connection timeout')])
    ])
    if (error) throw error
    this.tcpSocket.once('close', () => this.destroy())
    this.tcpSocket.once('error', this._errorHandler.bind(this))
    this.tcpSocket.once('timeout', () => this.destroy(new Error('TCP timeout')))
    this.tcpSocket.pipe(this.tcpParser)
    this.tcpSerializer.pipe(this.tcpSocket)
    this.emit('connect')
  }

  write (type, data, passthrough = false) {
    const packet = { passthrough, type, data }
    this.emit('write', packet)
    return this.tcpSerializer.write(packet)
  }

  writeRaw (buf) {
    return this.tcpSocket.write(buf)
  }

  async udpConnect () {
    this.udpSocket = new UdpSocket.Client({
      port: this.options.portUdp,
      host: this.options.host,
      family: this.options.legacyIP ? 4 : 6,
      signal: this.abortController.signal
    })
    const [error] = await Promise.race([
      once(this.udpSocket, 'connect'),
      once(this.udpSocket, 'error')
    ])
    if (error) throw error
    this.udpSocket.on('close', () => this.destroy())
    this.udpSocket.on('error', this._errorHandler.bind(this))
    this.udpSocket.pipe(this.udpParser)
    this.udpSerializer.pipe(this.udpSocket)
  }

  writeUdp (type, data) {
    const packet = { type, data }
    this.emit('write', packet)
    return this.udpSerializer.write({ clientId: this.clientId, packet })
  }

  writeUdpRaw (buf) {
    return this.udpSocket.send(buf)
  }

  _errorHandler (err) {
    if (err.code === 'ABORT_ERR' || err.code === 'ECONNRESET' || err.code === 'EPIPE') return
    this.emit('error', err)
  }

  destroy (error) {
    this.tcpSocket?.unref()
    if (error) this.emit('error', error)
    this.abortController.abort(error)
  }
}

module.exports = Client
