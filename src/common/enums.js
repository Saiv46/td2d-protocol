const versions = require('../versions')

function enumGeneric (byId) {
  const defaultVal = byId.includes(null) ? -1 : 0
  const byName = Object.fromEntries(byId.filter(v => v !== null).map((v, i) => ([v, i])))
  return {
    byId,
    byName,
    hasId: index => index >= defaultVal && index < (byId.length + defaultVal),
    length: byId.length,
    default: defaultVal
  }
}

module.exports = {}
for (const name in versions) {
  const { enums } = versions[name]
  const obj = {}
  for (const key in enums) {
    obj[key] = enumGeneric(enums[key])
  }
  module.exports[name] = obj
}
