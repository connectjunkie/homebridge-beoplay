const BeoplayPlatformDevice = require('./BeoplayPlatformDevice')

const {
  PLUGIN_NAME,
  PLATFORM_NAME
} = require('./Constants')

var beoplaydevices = []
var accessories = []

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
          this.log.info('Initialising platform device %s', device.name)
          const newdevice = new BeoplayPlatformDevice(accessories, this.log, device, this.api)
          beoplaydevices.push(newdevice)
        }
      }
    } else if (this.config.devices) {
      this.log.info('The devices configuration is not properly formatted. Cannot initialize. Type: %s', typeof this.config.devices)
    }

    if (!this.config.devices) {
      this.log.info('No configured devices found')
    }
  }

  configureAccessory (accessory) {
    this.log.info('Loading cached accessory %s', accessory.displayName)
    accessories.push(accessory)
  }

  removeAccessory (accessory) {
    this.log.info('Removing accessory %s', accessory.displayName)
    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])
  }
}

module.exports = BeoplayPlatform
