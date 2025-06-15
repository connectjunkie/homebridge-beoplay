import BeoplayPlatformDevice from './BeoplayPlatformDevice.js'

import {
  PLUGIN_NAME,
  PLATFORM_NAME
} from './Constants.js'

let UUIDGen

/**
 * Main Homebridge platform for Bang & Olufsen (Beoplay) devices
 * Manages multiple B&O devices and handles platform-level operations
 */
class BeoplayPlatform {
  /**
   * Creates a new BeoplayPlatform instance
   * @param {Object} log - Homebridge logging instance
   * @param {Object} config - Platform configuration from config.json
   * @param {Array} config.devices - Array of device configurations
   * @param {Object} api - Homebridge API instance
   */
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

    if (this.api) {
      this.api.on('didFinishLaunching', this.initDevices.bind(this))
    }
  }

  /**
   * Initializes all configured B&O devices after Homebridge platform launch
   * Creates BeoplayPlatformDevice instances and manages accessory lifecycle
   */
  initDevices () {
    // read from config.devices
    if (this.config.devices && Array.isArray(this.config.devices)) {
      for (const device of this.config.devices) {
        if (device) {
          this.log.info('Initialising %s', device.name || 'B&O Device')
          const newdevice = new BeoplayPlatformDevice(this, this.log, device, this.api)
          this.beoplaydevices.push(newdevice)
          this.deviceids.push(UUIDGen.generate((device.name || 'B&O Device') + device.ip + device.type))
        }
      }
    } else if (this.config.devices) {
      this.log.error('The devices configuration is not properly formatted. Cannot initialize. Type: %s', typeof this.config.devices)
      return
    }

    if (!this.config.devices) {
      this.log.error('No configured devices found in the config.json file')
      return
    }

    for (const accessory of this.accessories) {
      if (!this.deviceids.includes(accessory.UUID)) {
        this.removeAccessory(accessory)
      }
    }
  }

  /**
   * Called by Homebridge to restore cached accessories on startup
   * @param {Object} accessory - Homebridge PlatformAccessory to restore
   */
  configureAccessory (accessory) {
    this.log.info('Loading cached accessory %s with UUID %s', accessory.displayName, accessory.UUID)
    this.accessories.push(accessory)
  }

  /**
   * Removes an accessory from Homebridge when device is no longer configured
   * @param {Object} accessory - Homebridge PlatformAccessory to remove
   */
  removeAccessory (accessory) {
    this.log.info('Removing accessory %s with UUID %s', accessory.displayName, accessory.UUID)
    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])
  }
}

export default BeoplayPlatform