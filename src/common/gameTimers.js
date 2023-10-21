const timers = require('node:timers/promises')
const { performance } = require('node:perf_hooks')

class GameTimers {
  static MinTickRate = 50 // 20ms
  static MaxTickRate = 100 // 10ms

  // Not actually a second, but everyone's hosting on mom's PC
  // running Windows, so HanderDev put 15ms tick period for it to work
  static Period = 15
  static TickRate = 60
  static Second = this.TickRate * this.Period

  //
  static MinDynamicPeriod = 1000 / this.MinTickRate
  static MaxDynamicReriod = 1000 / this.MaxTickRate
  static DynamicPeriodRange = this.MaxDynamicReriod - this.MinDynamicPeriod
  static async * dynamicTick (signal) {
    let time = performance.now()
    let util1 = performance.eventLoopUtilization()
    let util2 = performance.eventLoopUtilization(util1)
    while (!signal.aborted) {
      const util = performance.eventLoopUtilization(util1, util2)
      util1 = util2
      util2 = util
      await this.wait((1 - util.utilization) * this.DynamicPeriodRange + this.MinDynamicReriod, signal)
      const now = performance.now()
      const delta = (now - time) / this.Period
      time = now
      yield delta
    }
  }

  static async * steadyTick (signal) {
    let time = performance.now()
    // eslint-disable-next-line no-unused-vars
    for await (const _ of timers.setInterval(this.Period, undefined, { signal })) {
      const now = performance.now()
      const delta = (now - time) / this.Period
      time = now
      yield delta
    }
  }

  static async * steadyInterval (seconds, signal) {
    yield
    // eslint-disable-next-line no-unused-vars
    for await (const _ of timers.setInterval((seconds ?? 1) * this.Second, undefined, { signal })) {
      yield
    }
  }

  static async wait (ms = 0, signal) {
    return timers.setTimeout(ms, undefined, { signal })
  }
}

module.exports = GameTimers
