import BeoplayDevice from './BeoplayDevice.js'

class BeoplayAccessory extends BeoplayDevice {
  constructor (log, config, api) {
    super(log, config, api)

    if (this.startupError) {
      this.log.error('Error creating the Beoplay accessory, please check your config is correctly formatted')
      return
    }

    this.log.warn(`[${this.name}] WARNING - The configuration of your Beoplay plugin is outdated. Please review the README and update your config.json`)
  }

  getServices () {
    return this.services
  }
}

export default BeoplayAccessory