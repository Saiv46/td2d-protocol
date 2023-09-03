module.exports = {
  Enums: require('./common/enums'),
  Protocol: require('./common/protocol'),
  GameTimers: require('./common/gameTimers'),
  VersionData: require('./versions'),
  ...require('./server'),
  ...require('./client')
}
