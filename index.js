'use strict'

const BeoplayAccessory = require('./lib/BeoplayAccessory')
const BeoplayPlatform = require('./lib/BeoplayPlatform')
const { PLUGIN_NAME, PLATFORM_NAME } = require('./lib/Constants')

module.exports = function (homebridge) {
  homebridge.registerAccessory(PLUGIN_NAME, PLATFORM_NAME, BeoplayAccessory)
  homebridge.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, BeoplayPlatform, true)
}
