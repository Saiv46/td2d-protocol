const Protocol = require('./protocol')
const Header = Buffer.from('hPKT\0')

module.exports = function TcpPacketSerialize (packet, version) {
  const useHeader = version === 100
  const HeaderLen = useHeader * Header.length
  const size = Protocol[version].sizeOf(packet, 'tcp_packet')
  const buffer = Buffer.allocUnsafe(HeaderLen + 1 + size)
  Protocol[version].write(packet, buffer, HeaderLen + 1, 'tcp_packet')
  if (useHeader) Header.copy(buffer)
  buffer.writeUInt8(size, HeaderLen)
  return buffer
}
