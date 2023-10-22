const debug = require('debug')('td2d-protocol:client')
const { EventEmitter, once } = require('node:events')
const { createConnection } = require('node:net')
const Protocol = require('../common/protocol')
const dnsLookupNoop = require('../common/dnsNoop')
const UdpSocket = require('../common/udpStream')
const TcpPacketParser = require('../common/tcpParser')
const TcpPacketSerialize = require('../common/tcpSerializer')
const GameTimers = require('../common/gameTimers')

const debugPacket = debug.extend('packet')
const debugWrite = debug.extend('write')

// Events:
// - error (error: Error)
// - close (error: AbortError)
// - [PacketType] (data: any)
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

  constructor (options = {}) {
    super({ captureRejections: true })
    this.options = Object.assign({}, Client.DefaultOptions, options)
    this.abortController = this.options.abortController ?? new AbortController()
    this.clientId = 0
    this.tcpSocket = null
    this.udpSocket = null

    const { version } = this.options
    const { signal } = this.abortController
    this.tcpParser = new TcpPacketParser(version, signal)
    this.tcpParser.on('data', this.emit.bind(this, 'data'))
    this.tcpParser.on('error', this._errorHandler.bind(this))
    signal.addEventListener('abort', () => this.emit('close', signal.reason.cause))
    this.on('data', packet => this.emit(packet.type, packet.data))

    {
      const uniqueId = Math.random() * 0xffff | 0
      this.logger = debug.extend(uniqueId, '@')
      this.loggerPacket = debugPacket.extend(uniqueId, '@')
      this.loggerWrite = debugWrite.extend(uniqueId, '@')
    }
    this.logger('Created', this.options)
    this.on('error', err => this.logger(err))
    this.on('close', () => this.logger('Disconnected'))
    this.on('data', packet => this.loggerPacket(packet.type, packet.data))
    this.on('write', packet => this.loggerWrite(packet.type, packet.data, packet.passthrough ?? '[UDP]'))
  }

  async connect () {
    await Promise.all([
      this.tcpConnect(),
      this.udpConnect()
    ])
  }

  async tcpConnect () {
    this.logger('Connecting to %s:%d/tcp', this.options.host ?? 'localhost', this.options.portTcp)
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
    this.emit('connect')
  }

  write (type, data, passthrough = false) {
    const packet = { passthrough, type, data }
    this.emit('write', packet)
    return this.writeRaw(TcpPacketSerialize(packet, this.options.version))
  }

  writeRaw (buf) {
    return this.tcpSocket.write(buf)
  }

  async udpConnect () {
    this.logger('Connecting to %s:%d/udp', this.options.host ?? 'localhost', this.options.portUdp)
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
    this.udpSocket.on('data', buffer => {
      try {
        this.emit('data', UdpClientParse(buffer, this.options.version))
      } catch {}
    })
  }

  writeUdp (type, data) {
    const packet = { type, data }
    this.emit('write', packet)
    return this.writeUdpRaw(UdpClientSerialize({ clientId: this.clientId, packet }, this.options.version))
  }

  writeUdpRaw (buf) {
    return this.udpSocket.write(buf)
  }

  _errorHandler (err) {
    if (err.code === 'ABORT_ERR' || err.code === 'ECONNRESET' || err.code === 'EPIPE') return
    this.emit('error', err)
  }

  destroy (error) {
    if (this.abortController.signal.aborted) return
    this.tcpSocket?.unref()
    if (error) this.emit('error', error)
    this.abortController.abort(error)
  }
}

function UdpClientParse (buffer, version) {
  return Protocol[version].read(buffer, 1, 'udp_outgoing').value
}

function UdpClientSerialize (packet, version) {
  const length = Protocol[version].sizeOf(packet, 'udp_incoming')
  if (Number.isNaN(length)) {
    throw new Error(`Invalid packet ${JSON.stringify(packet)}`)
  }
  const buffer = Buffer.allocUnsafe(length)
  Protocol[version].write(packet, buffer, 0, 'udp_incoming')
  return buffer
}

module.exports = Client
