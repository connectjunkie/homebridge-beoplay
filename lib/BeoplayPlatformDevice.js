const BeoplayDevice = require('./BeoplayDevice')
const PLUGIN_NAME = require('./lib/Constants')

var Accessory

class BeoplayPlatformDevice extends BeoplayDevice {
  constructor (log, config, api) {
    super(log, config, api)

    this.api = api
    Accessory = api.platformAccessory

    if (this.startupError) {
      this.log.error('Failed to create platform device. Please check your device config')
      return
    }

    this.log.info(`Setting up device: ${this.name}`)

    // generate uuid
    this.UUID = api.hap.uuid.generate(config.ip)

    // prepare the accessory
    if (this.type === 'speaker') {
      var speakerAccessory = new Accessory(this.name, this.UUID, api.hap.Accessory.Categories.FAN)
      for (const service of this.services) {
        speakerAccessory.addService(service)
      }
    } else if (this.type === 'bulb') {
      var bulbAccessory = new Accessory(this.name, this.UUID, api.hap.Accessory.Categories.FAN)
      for (const service of this.services) {
        bulbAccessory.addService(service)
      }
    } else if (this.type === 'tv') {
      var tvAccesory = new Accessory(this.name, this.UUID, api.hap.Accessory.Categories.TELEVISION)
      for (const service of this.services) {
        tvAccesory.addService(service)
      }
      this.api.publishExternalAccessories(PLUGIN_NAME, [tvAccesory])
    } else if (this.type === 'fan') {
      var fanAccessory = new Accessory(this.name, this.UUID, api.hap.Accessory.Categories.FAN)
      for (const service of this.services) {
        fanAccessory.addService(service)
      }
    } else {
      this.log('Incorrect value for "type" specified')
    }
  }
}

module.exports = BeoplayPlatformDevice
