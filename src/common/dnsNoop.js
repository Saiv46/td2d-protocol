function dnsLookupNoop (family) {
  const type = 'IPv' + family
  return (hostname, _, callback) => callback(null, hostname, type)
}

module.exports = dnsLookupNoop
