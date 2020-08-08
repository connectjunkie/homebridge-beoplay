const BeoplayServices = require('./BeoplayServices')

const {
  PLUGIN_NAME,
  PLATFORM_NAME
} = require('./Constants')

var accessories = []
var uuids = []
var PlatformAccessory

class BeoplayPlatform {
  constructor (log, config, api) {
    if (!config) {
      return
    }

    this.log = log
    this.config = config
    this.api = api
    PlatformAccessory = api.platformAccessory

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
          const uuid = this.api.hap.uuid.generate(device.name + device.ip + device.type)
          uuids.push(uuid)
          if (!accessories.find(accessory => accessory.UUID === uuid)) {
            // hasn't been loaded as a cached accessory
            const accessory = new PlatformAccessory(device.name, uuid)
            // setup the accessory
            BeoplayServices.initPlatformAccessory(this.log, device, this.api, accessory)
            // register the accessory
            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])
            accessories.push(accessory)
          }
        }
      }
    } else if (this.config.devices) {
      this.log.info('The devices configuration is not properly formatted. Cannot initialize. Type: %s', typeof this.config.devices)
    }

    if (!this.config.devices) {
      this.log.info('No configured devices found')
    }

    for (const accessory of accessories) {
      if (!uuids.find(uuid => accessory.UUID === uuid)) {
        // has been loaded as a cached accessory, but isn't in the current config
        this.removeAccessory(accessory)
      }
    }
  }

  configureAccessory (platformAccessory) {
    accessories.push(platformAccessory)
  }

  removeAccessory (platformAccessory) {
    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [platformAccessory])
  }
}

module.exports = BeoplayPlatform
