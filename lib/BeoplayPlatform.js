const BeoplayPlatformDevice = require('./BeoplayPlatformDevice')
const { PLUGIN_NAME, PLATFORM_NAME } = require('./Constants')

var platformDevices = []

class BeoplayPlatform {
  constructor (log, config, api) {
    if (!config) {
      return
    }

    this.log = log
    this.config = config
    this.api = api

    if (this.api) {
      this.api.on('didFinishLaunching', this.initDevices.bind(this))
    }
  }

  initDevices () {
    this.log.info('Setting up devices')

    // read from config.devices
    if (this.config.devices && Array.isArray(this.config.devices)) {
      for (const device of this.config.devices) {
        if (device) {
          platformDevices.push(new BeoplayPlatformDevice(this.log, device, this.api))
        }
      }
    } else if (this.config.devices) {
      this.log.info('The devices configuration is not properly formatted. Cannot initialize. Type: %s', typeof this.config.devices)
    }

    if (!this.config.devices) {
      this.log.info('No configured devices found')
    }
  }

  configureAccessory (platformAccessory) {
  }

  removeAccessory (platformAccessory) {
    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [platformAccessory])
  }
}

module.exports = BeoplayPlatform
