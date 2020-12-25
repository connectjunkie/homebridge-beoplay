const BeoplayPlatformDevice = require('./BeoplayPlatformDevice')

const {
  PLUGIN_NAME,
  PLATFORM_NAME
} = require('./Constants')

const beoplaydevices = []
const accessories = []
const deviceids = []
let UUIDGen

class BeoplayPlatform {
  constructor (log, config, api) {
    if (!config) {
      return
    }

    this.log = log
    this.config = config
    this.api = api
    UUIDGen = api.hap.uuid

    if (this.api) {
      this.api.on('didFinishLaunching', this.initDevices.bind(this))
    }
  }

  initDevices () {
    // read from config.devices
    if (this.config.devices && Array.isArray(this.config.devices)) {
      for (const device of this.config.devices) {
        if (device) {
          this.log.info('Initialising %s', device.name)
          const newdevice = new BeoplayPlatformDevice(accessories, this.log, device, this.api)
          beoplaydevices.push(newdevice)
          deviceids.push(UUIDGen.generate(device.name + device.ip + device.type))
        }
      }
    } else if (this.config.devices) {
      this.log.info('The devices configuration is not properly formatted. Cannot initialize. Type: %s', typeof this.config.devices)
    }

    if (!this.config.devices) {
      this.log.info('No configured devices found')
    }

    for (const accessory of accessories) {
      if (!deviceids.includes(accessory.context.id)) {
        this.removeAccessory(accessory)
      }
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
