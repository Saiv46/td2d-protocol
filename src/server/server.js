const { EventEmitter, once } = require('node:events')
const { createServer } = require('node:net')
const UdpSocket = require('../common/udpStream')
const TcpPacketParser = require('../common/tcpParser')
const TcpPacketSerializer = require('../common/tcpSerializer')
const UdpServerParser = require('./udpParser')
const UdpServerSerializer = require('./udpSerializer')
const GameTimers = require('../common/gameTimers')
const { addAbortSignal } = require('node:stream')

// Events:
// - error (error: Error)
// - close (error: AbortError)
// - [PacketType] (data: any, passthrough: boolean)
// - data (packet: Packet)
// - write (packet: Packet)

class ServerClient extends EventEmitter {
  constructor (server, tcpSocket) {
    super({ captureRejections: true })
    this.options = server.options
    this.server = server
    this.abortController = new AbortController()
    this.clientId = 0
    this.tcpSocket = tcpSocket
    this.rinfo = null

    const { version } = this.options
    const { signal } = this.abortController
    this.tcpParser = new TcpPacketParser(version, signal)
    this.tcpSerializer = new TcpPacketSerializer(version, signal)
    addAbortSignal(this.abortController.signal, this.tcpSocket)

    this.tcpSocket.setTimeout(this.options.timeout)
    this.tcpSocket.once('close', () => this.destroy())
    this.tcpSocket.once('error', this._errorHandler.bind(this))
    this.tcpSocket.once('timeout', () => this.destroy(new Error('TCP timeout')))
    this.tcpSocket.pipe(this.tcpParser)
    this.tcpSerializer.pipe(this.tcpSocket)
    this.emit('connect')

    this.tcpParser.on('data', this.emit.bind(this, 'data'))
    this.tcpParser.on('error', this._errorHandler.bind(this))
    this.tcpSerializer.on('error', this._errorHandler.bind(this))
    signal.addEventListener('abort', () => this.emit('close', signal.reason.cause))
    this.on('data', packet => this.emit(packet.type, packet.data, packet.passthrough))
  }

  write (type, data, passthrough = false) {
    const packet = { passthrough, type, data }
    this.emit('write', packet)
    return this.tcpSerializer.write(packet)
  }

  writeRaw (buf) {
    return this.tcpSocket.write(buf)
  }

  writeUdp (type, data) {
    if (!this.rinfo) throw new Error('Not connected yet')
    const packet = { type, data }
    this.emit('write', packet)
    return this.server.udpSerializer.write([{ clientId: this.clientId, packet }, this.rinfo])
  }

  writeUdpRaw (buf) {
    if (!this.rinfo) throw new Error('Not connected yet')
    return this.server.udpServer.write([buf, this.rinfo])
  }

  _errorHandler (err) {
    if (err.code === 'ABORT_ERR' || err.code === 'ECONNRESET' || err.code === 'EPIPE') return
    this.emit('error', err)
  }

  destroy (error) {
    this.server = null
    this.tcpSocket?.unref()
    if (error) this.emit('error', error)
    this.abortController.abort(error)
  }
}

// Events:
// - error (error: Error)
// - close (cause: Error)
// - connection (client: ServerClient)
// - drop (client: ServerClient)

class Server extends EventEmitter {
  static DefaultOptions = {
    legacyIP: false,
    version: 100,
    portTcp: 7606,
    portUdp: 8606,
    heartbeat: 2 * GameTimers.Second,
    timeout: 10 * GameTimers.Second,
    abortController: null
  }

  constructor (options) {
    super({ captureRejections: true })
    this.options = Object.assign({}, Server.DefaultOptions, options)
    this.abortController = this.options.abortController ?? new AbortController()
    this.clients = new Map()
    this.tcpServer = null
    this.udpServer = null
    const { signal } = this.abortController
    this.udpParser = new UdpServerParser(this.options.version, signal)
    this.udpSerializer = new UdpServerSerializer(this.options.version, signal)
    this.udpParser.on('data', this._udpHandler.bind(this))
    this.udpParser.on('error', this._errorHandler.bind(this))
    this.udpSerializer.on('error', this._errorHandler.bind(this))

    signal.addEventListener('abort', () => this.emit('close', signal.reason.cause))
  }

  async listen () {
    await Promise.all([
      this.tcpListen(),
      this.udpListen()
    ])
  }

  async tcpListen () {
    this.tcpServer = createServer({
      noDelay: true,
      keepAlive: true
    })
    this.tcpServer.listen({
      port: this.options.portTcp,
      host: this.options.host,
      signal: this.abortController.signal
    })
    const [error] = await Promise.race([
      once(this.tcpServer, 'listening'),
      once(this.tcpServer, 'error')
    ])
    if (error) throw error
    this.tcpServer.on('connection', this._tcpConnection.bind(this))
    this.tcpServer.once('error', this._errorHandler.bind(this))
    this.emit('listening')
  }

  _tcpConnection (socket) {
    const client = new ServerClient(this, socket)
    try {
      const id = this._getRandomId()
      client.clientId = id
      this.clients.set(id, client)
      this.emit('connection', client)
    } catch (err) {
      this.emit('error', err)
      if (!this.emit('drop', client)) client.destroy()
    }
  }

  async udpListen () {
    this.udpServer = new UdpSocket.Server({
      port: this.options.portUdp,
      host: this.options.host,
      family: this.options.legacyIP ? 4 : 6,
      signal: this.abortController.signal
    })
    const [error] = await Promise.race([
      once(this.udpServer, 'listening'),
      once(this.udpServer, 'error')
    ])
    if (error) throw error
    this.udpServer.pipe(this.udpParser)
    this.udpSerializer.pipe(this.udpServer)
    this.udpServer.once('error', this._errorHandler.bind(this))
    this.emit('ready')
  }

  _udpHandler ([{ clientId, packet }, rinfo]) {
    const client = this.clients.get(clientId)
    if (!client) return
    if (!client.rinfo) {
      client.rinfo = rinfo
    }
    if (client.rinfo.address === rinfo.address) client.emit('data', packet)
  }

  _errorHandler (err) {
    if (err.code === 'ABORT_ERR') return
    this.destroy(err)
  }

  destroy (error) {
    this.tcpServer?.unref()
    if (error) this.emit('error', error)
    this.abortController.abort(error)
  }

  _getRandomId () {
    for (let i = 0; i < 100; i++) {
      const id = 1 + Math.floor(Math.random() * 0xFFFF)
      if (!this.clients.has(id)) return id
    }
    // Fallback
    for (let i = 0xFFFF; i > 0; i--) {
      if (!this.clients.has(i)) return i
    }
    throw new Error('Cannot get random ID')
  }
}

module.exports = Server
