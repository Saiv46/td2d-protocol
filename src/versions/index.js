const v100 = {
  enums: require('./100/enums.json'),
  limits: require('./100/limits.json'),
  protocol: require('./100/protocol.json')
}
const v101 = {
  ...v100,
  protocol: require('./101/protocol.json'),
  kickreasons: require('./101/kickreasons.json')
}

module.exports = {
  100: v100,
  101: v101,
  1013: v101,
  1014: v101,
}
