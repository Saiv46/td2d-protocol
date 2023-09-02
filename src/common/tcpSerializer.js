const Protocol = require('./protocol')
const Header = Buffer.from('hPKT\0')
const HeaderLen = Header.length + 1

module.exports = function TcpPacketSerialize (packet, version) {
  const size = Protocol[version].sizeOf(packet, 'tcp_packet')
  const buffer = Buffer.allocUnsafe(HeaderLen + size)
  Protocol[version].write(packet, buffer, HeaderLen, 'tcp_packet')
  Header.copy(buffer)
  buffer.writeUInt8(size, Header.length)
  return buffer
}
