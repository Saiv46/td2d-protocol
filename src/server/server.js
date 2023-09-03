const { EventEmitter, once } = require('node:events')
const { createServer } = require('node:net')
const Protocol = require('../common/protocol')
const UdpSocket = require('../common/udpStream')
const TcpPacketParser = require('../common/tcpParser')
const TcpPacketSerialize = require('../common/tcpSerializer')
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
    addAbortSignal(this.abortController.signal, this.tcpSocket)

    this.tcpSocket.setTimeout(this.options.timeout)
    this.tcpSocket.once('close', () => this.destroy())
    this.tcpSocket.once('error', this._errorHandler.bind(this))
    this.tcpSocket.once('timeout', () => this.destroy(new Error('TCP timeout')))
    this.tcpSocket.pipe(this.tcpParser)
    this.emit('connect')

    this.tcpParser.on('data', this.emit.bind(this, 'data'))
    this.tcpParser.on('error', this._errorHandler.bind(this))
    signal.addEventListener('abort', () => this.emit('close', signal.reason.cause))
    this.on('data', packet => this.emit(packet.type, packet.data, packet.passthrough))
  }

  write (type, data) {
    const packet = { passthrough: false, type, data }
    this.emit('write', packet)
    return this.writeRaw(TcpPacketSerialize(packet, this.options.version))
  }

  writeRaw (buf) {
    return this.tcpSocket.write(buf)
  }

  writeUdp (type, data) {
    if (!this.rinfo) throw new Error('Not connected yet')
    const packet = { type, data }
    this.emit('write', packet)
    return this.writeUdpRaw(UdpServerSerialize(packet, this.options.version))
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
      client.once('error', this.emit.bind(this, 'clienterror'))
      client.once('close', () => this.clients.delete(id))
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
    this.udpServer.on('data', this._udpHandler.bind(this))
    this.udpServer.once('error', this._errorHandler.bind(this))
    this.emit('ready')
  }

  _udpHandler ([buf, rinfo]) {
    const { clientId, packet } = UdpServerParse(buf, this.options.version)
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
    for (const client of this.clients.values()) {
      client.destroy()
    }
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

  broadcast (type, data) {
    this.broadcastRaw(TcpPacketSerialize({ passthrough: false, type, data }, this.options.version))
  }

  broadcastRaw (buf) {
    for (const client of this.clients.values()) {
      client.writeRaw(buf)
    }
  }

  broadcastUdp (type, data) {
    this.broadcastUdpRaw(UdpServerSerialize({ type, data }, this.options.version))
  }

  broadcastUdpRaw (buf) {
    for (const client of this.clients.values()) {
      if (client.rinfo) client.writeUdpRaw(buf)
    }
  }
}

function UdpServerParse (buffer, version) {
  return Protocol[version].read(buffer, 0, 'udp_incoming').value
}

function UdpServerSerialize (packet, version) {
  const length = Protocol[version].sizeOf(packet, 'udp_outgoing')
  const buffer = Buffer.allocUnsafe(length + 1)
  Protocol[version].write(packet, buffer, 1, 'udp_outgoing')
  return buffer
}

module.exports = Server
