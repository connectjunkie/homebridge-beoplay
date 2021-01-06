const BeoplayPlatformDevice = require('./BeoplayPlatformDevice')

const {
  PLUGIN_NAME,
  PLATFORM_NAME
} = require('./Constants')

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

    this.beoplaydevices = []
    this.accessories = []
    this.deviceids = []
    this.newDeviceAccessories = []
    this.externalDeviceAccessories = []
    this.unusedDeviceAccessories = []

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
          const newdevice = new BeoplayPlatformDevice(this, this.log, device, this.api)
          this.beoplaydevices.push(newdevice)
          this.deviceids.push(UUIDGen.generate(device.name + device.ip + device.type))
        }
      }
      this.registerAccessories()
    } else if (this.config.devices) {
      this.log.error('The devices configuration is not properly formatted. Cannot initialize. Type: %s', typeof this.config.devices)
      return
    }

    if (!this.config.devices) {
      this.log.error('No configured devices found in the config.json file')
      return
    }

    for (const accessory of this.accessories) {
      if (!this.deviceids.includes(accessory.context.id)) {
        this.removeAccessory(accessory)
      }
    }
  }

  configureAccessory (accessory) {
    this.log.info('Loading cached accessory %s', accessory.displayName)
    this.accessories.push(accessory)
  }

  removeAccessory (accessory) {
    this.log.info('Removing accessory %s', accessory.displayName)
    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])
  }

  registerAccessories () {
    // Registers any newly created accessories
    if (this.newDeviceAccessories) this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, this.newDeviceAccessories)

    // Register external devices (e.g. TVs). This will happen each time as they are not cached
    if (this.externalDeviceAccessories) this.api.publishExternalAccessories(PLUGIN_NAME, this.externalDeviceAccessories)

    // Removes all unused accessories
    // for (let i = 0; i < this.unusedDeviceAccessories.length; i++) {
    //  const unusedDeviceAccessory = this.unusedDeviceAccessories[i]
    //  this.log.info('Removing unused accessory with id ' + (this.name + this.ip + this.type) + ' and kind ' + unusedDeviceAccessory.context.kind + '.')
    //  this.accessories.splice(this.accessories.indexOf(unusedDeviceAccessory), 1)
    // }
    // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, this.unusedDeviceAccessories)
  }
}

module.exports = BeoplayPlatform
