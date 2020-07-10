'use strict'
const BeoplayDevice = require('./BeoplayDevice')

class BeoplayAccessory extends BeoplayDevice {
  constructor (log, config, api) {
    super(log, config, api)

    if (this.startupError) {
      this.log.error('Error creating the Beoplay accessory, please check your config is correctly formatted')
      return
    }

    this.log.warn(`[${this.name}] WARNING - The Beoplay plugin is now a platform plugin, which addresses issues with iOS14. Please review the README to update your config.json`)
  }

  getServices () {
    return this.services
  }
}

module.exports = BeoplayAccessory
