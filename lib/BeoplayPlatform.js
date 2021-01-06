const BeoplayPlatformDevice = require('./BeoplayPlatformDevice')

const {
  PLUGIN_NAME,
  PLATFORM_NAME
} = require('./Constants')

const beoplaydevices = []
const accessories = []
const deviceids = []
const newDeviceAccessories = []
const externalDeviceAccessories = []
const unusedDeviceAccessories = []

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
      this.registerAccessories()
    } else if (this.config.devices) {
      this.log.error('The devices configuration is not properly formatted. Cannot initialize. Type: %s', typeof this.config.devices)
      return
    }

    if (!this.config.devices) {
      this.log.error('No configured devices found in the config.json file')
      return
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

  registerAccessories () {
    // Registers any newly created accessories
    if (newDeviceAccessories) this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, newDeviceAccessories)

    // Register external devices (e.g. TVs). This will happen each time as they are not cached
    if (externalDeviceAccessories) this.api.publishExternalAccessories(PLUGIN_NAME, externalDeviceAccessories)

    // Removes all unused accessories
    for (let i = 0; i < unusedDeviceAccessories.length; i++) {
      const unusedDeviceAccessory = unusedDeviceAccessories[i]
      this.log.info('Removing unused accessory with id ' + (this.name + this.ip + this.type) + ' and kind ' + unusedDeviceAccessory.context.kind + '.')
      this.accessories.splice(this.accessories.indexOf(unusedDeviceAccessory), 1)
    }
    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, this.unusedDeviceAccessories)
  }
}

module.exports = BeoplayPlatform
