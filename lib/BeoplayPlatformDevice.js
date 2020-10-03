'use strict'

// Represents each Beoplay device you have loaded via the platform
const isip = require('is-ip')
const got = require('got')
const util = require('util')
const syncrequest = require('sync-request')
const tunnel = require('tunnel')

const {
  PLUGIN_VERSION,
  PLATFORM_NAME,
  PLUGIN_NAME
} = require('./Constants')

var Characteristic, Service, Accessory, UUIDGen, Categories

class BeoplayPlatformDevice {
  constructor (accessories, log, config, api) {
    this.accessories = accessories
    this.log = log
    this.api = api
    this.startupError = null

    this.name = config.name || 'B&O Device'

    Characteristic = api.hap.Characteristic
    Service = api.hap.Service
    Categories = api.hap.Categories
    Accessory = api.platformAccessory
    UUIDGen = api.hap.uuid

    try {
      if (!isip(config.ip)) throw new Error(`IP address is required for device ${config.name}`)
    } catch (error) {
      this.log(error)
      this.startupError = error
      return
    }

    this.ip = config.ip
    this.type = config.type || 'speaker'
    this.mode = config.mode || ((this.type === 'tv') ? 'power' : 'mute')
    this.on = config.on || ((this.type === 'tv') ? 'input' : 'on')
    this.default = config.default || 1
    this.inputs = config.inputs || []
    this.exclude = config.exclude || []
    this.debug = config.debug || false
    this.debugproxy = config.debugproxy

    if (this.inputs.length && this.exclude.length) {
      // user has supplied both an inputs values and an exclude value. Ignore the excludes value
      this.exclude = []
    }

    // Default to the Max volume in case this is not obtained before the volume is set the first time
    this.maxVolume = 90
    this.currentVolume = 0
    this.currentPowerState = false
    this.volume = {}
    this.mute = {}
    this.power = {}
    this.input = {}
    this.join = {}
    this.jid = ''

    this.newDeviceAccessories = []
    this.externalDeviceAccessories = []
    this.deviceAccessories = []
    this.unusedDeviceAccessories = []

    this.baseUrl = util.format('http://%s:8080', this.ip)

    this.deviceUrl = this.baseUrl + '/BeoDevice'
    this.sourceUrl = this.baseUrl + '/BeoZone/Zone/Sources/'

    this.volume.statusUrl = this.baseUrl + '/BeoZone/Zone/Sound/Volume'
    this.volume.setUrl = this.baseUrl + '/BeoZone/Zone/Sound/Volume/Speaker/Level'

    this.mute.statusUrl = this.volume.statusUrl
    this.mute.setUrl = this.baseUrl + '/BeoZone/Zone/Sound/Volume/Speaker/Muted'

    this.power.statusUrl = this.baseUrl + '/BeoDevice/powerManagement'
    this.power.setUrl = this.baseUrl + '/BeoDevice/powerManagement/standby'

    this.input.statusUrl = this.baseUrl + '/BeoZone/Zone/ActiveSources'
    this.input.setUrl = this.baseUrl + '/BeoZone/Zone/ActiveSources'

    this.join.joinUrl = this.baseUrl + '/BeoZone/Zone/Device/OneWayJoin'
    this.join.leaveUrl = this.baseUrl + '/BeoZone/Zone/ActiveSources/primaryExperience'

    // prepare accessory services
    this.setupAccessoryServices()
  }

  identify (callback) {
    this.log('Identify requested!')
    callback()
  }

  setupAccessoryServices () {
    // ugly synchronous call to device info. Need to figure out a better way of doing this
    try {
      var res = syncrequest('GET', this.deviceUrl)
      var response = JSON.parse(res.getBody())
      this.model = response.beoDevice.productId.productType
      this.serialNumber = response.beoDevice.productId.serialNumber
      this.jid = res.headers['device-jid']
    } catch {
      // can't parse the device info - fail gracefully
      this.log('Reading device info failed. Have you supplied the correct IP address?')
      return
    }

    // Gets all accessories from the platform that match this device
    const deviceid = UUIDGen.generate(this.name + this.ip + this.type)
    this.unusedDeviceAccessories = this.accessories.filter(function (a) { return a.context.id === deviceid })

    if (this.type === 'speaker') {
      this.prepareSpeakerService()
    } else if (this.type === 'bulb') {
      this.prepareBulbService()
    } else if (this.type === 'tv') {
      this.prepareTvService()
    } else if (this.type === 'fan') {
      this.prepareFanService()
    } else {
      this.log('Incorrect value for "type" specified')
      return
    }

    if ((!this.inputs.length) && this.on === 'input') {
      // if no user supplied or parsed inputs and the user wants to power on this way
      this.parseInputs()
    }
  }

  prepareSpeakerService () {
    if (this.debug) this.log('Creating speaker')

    const speakerAccessory = this.getAccessory('speaker')

    this.registerAccessories()

    let speakerService = speakerAccessory.getService(Service.Speaker)
    if (!speakerService) {
      speakerService = speakerAccessory.addService(Service.Speaker)
    }

    if (this.mode === 'mute') { // we will mute the speaker when muted
      speakerService
        .getCharacteristic(Characteristic.Mute)
        .on('get', this.getMuteState.bind(this))
        .on('set', this.setMuteState.bind(this))
    } else { // we will put speaker in standby when muted
      speakerService
        .getCharacteristic(Characteristic.Mute)
        .on('get', this.getPowerState.bind(this))
        .on('set', this.setPowerState.bind(this))
    }

    if (speakerService.getCharacteristic(Characteristic.Volume)) {
      speakerService
        .getCharacteristic(Characteristic.Volume)
        .on('get', this.getVolume.bind(this))
        .on('set', this.setVolume.bind(this))
    } else {
      // add a volume setting to the speaker (not supported in the Home app or by Siri)
      speakerService
        .addCharacteristic(new Characteristic.Volume())
        .on('get', this.getVolume.bind(this))
        .on('set', this.setVolume.bind(this))
    }
  }

  prepareBulbService () {
    if (this.debug) this.log('Creating bulb')

    const bulbAccessory = this.getAccessory('bulb')

    this.registerAccessories()

    let bulbService = bulbAccessory.getService(Service.Lightbulb)
    if (!bulbService) {
      bulbService = bulbAccessory.addService(Service.Lightbulb)
    }

    if (this.mode === 'mute') { // we will mute the speaker when turned off
      bulbService
        .getCharacteristic(Characteristic.On)
        .on('get', this.getMuteState.bind(this))
        .on('set', this.setMuteState.bind(this))
    } else { // we will put speaker in standby when turned off
      bulbService
        .getCharacteristic(Characteristic.On)
        .on('get', this.getPowerState.bind(this))
        .on('set', this.setPowerState.bind(this))
    }

    // bind brightness setting to volume
    bulbService
      .getCharacteristic(Characteristic.Brightness)
      .on('get', this.getVolume.bind(this))
      .on('set', this.setVolume.bind(this))
  }

  prepareFanService () {
    if (this.debug) this.log.info('Creating fan')

    const fanAccessory = this.getAccessory('fan')

    this.registerAccessories()

    let fanService = fanAccessory.getService(Service.Fan)
    if (!fanService) {
      fanService = fanAccessory.addService(Service.Fan)
    }

    if (this.mode === 'mute') { // we will mute the device when turned off
      fanService
        .getCharacteristic(Characteristic.On)
        .on('get', this.getMuteState.bind(this))
        .on('set', this.setMuteState.bind(this))
    } else { // we will put device in standby when turned off
      fanService
        .getCharacteristic(Characteristic.On)
        .on('get', this.getPowerState.bind(this))
        .on('set', this.setPowerState.bind(this))
    }

    // bind rotation speed setting to volume
    fanService
      .getCharacteristic(Characteristic.RotationSpeed)
      .on('get', this.getVolume.bind(this))
      .on('set', this.setVolume.bind(this))
  }

  async prepareTvService () {
    if (this.debug) this.log('Creating tv')

    const tvAccessory = this.getAccessory('tv')
    tvAccessory.category = Categories.TELEVISION

    let tvService = tvAccessory.getService(Service.Television)
    if (!tvService) {
      tvService = tvAccessory.addService(Service.Television)
    }

    tvService
      .setCharacteristic(Characteristic.ConfiguredName, this.name)
      .setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE)

    if (this.mode === 'mute') { // we will mute the TV instead of turning off
      tvService
        .getCharacteristic(Characteristic.Active)
        .on('get', this.getMuteState.bind(this))
        .on('set', this.setMuteState.bind(this))
    } else { // default for TV - power on/off
      tvService
        .getCharacteristic(Characteristic.Active)
        .on('get', this.getPowerState.bind(this))
        .on('set', this.setPowerState.bind(this))
    }

    tvService
      .getCharacteristic(Characteristic.ActiveIdentifier)
      .on('get', this.getInput.bind(this))
      .on('set', this.setInput.bind(this))

    // Configure Remote Control (not currently implemented)
    tvService
      .getCharacteristic(Characteristic.RemoteKey)
      .on('set', this.remoteControl.bind(this))

    // Configuring Volume control
    if (this.debug) this.log('Creating tv speaker')

    let tvSpeakerService = tvAccessory.getService(Service.TelevisionSpeaker)
    if (!tvSpeakerService) {
      tvSpeakerService = tvAccessory.addService(Service.TelevisionSpeaker)
    }

    tvSpeakerService
      .setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
      .setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE)

    tvSpeakerService
      .getCharacteristic(Characteristic.VolumeSelector)
      .on('set', (state, callback) => {
        this.setVolumeSwitch(state, callback, !state)
      })

    tvSpeakerService
      .getCharacteristic(Characteristic.Mute)
      .on('get', this.getMuteState.bind(this))
      .on('set', this.setMuteState.bind(this))

    tvSpeakerService
      .addCharacteristic(Characteristic.Volume)
      .on('get', this.getVolume.bind(this))
      .on('set', this.setVolume.bind(this))

    tvService.addLinkedService(tvSpeakerService)

    this.getVolume()

    // Configure TV inputs

    if (!this.inputs.length) {
      // if the user hasn't supplied their own inputs
      this.parseInputs()
    }

    var configuredInputs = []
    var counter = 1
    var excluded = []

    this.inputs.forEach((input) => {
      if (this.exclude.includes(input.apiID)) {
      // this entry is on the exclude list
        if (this.debug) this.log('Excluded input: ' + input.name)
        excluded.push(input)
      } else {
        const name = input.name
        const type = this.determineInputType(input.type)

        let inputService = tvAccessory.getService(name.toLowerCase().replace(' ', ''))
        if (!inputService) {
          inputService = tvAccessory.addService(Service.InputSource, name.toLowerCase().replace(' ', ''), name)
        }

        inputService
          .setCharacteristic(Characteristic.Identifier, counter)
          .setCharacteristic(Characteristic.ConfiguredName, name)
          .setCharacteristic(Characteristic.InputSourceType, type)
          .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)

        configuredInputs.push(inputService)
        if (this.debug) this.log('Added input ' + counter + ', Name: ' + name)
        counter = counter + 1
      }
    })
    // sense check the default input selected
    if (this.default > counter) {
      this.default = counter - 1
      this.log('Default input out of range. Changed to input ' + this.default)
    }

    // remove excluded inputs from the list of inputs
    excluded.forEach((input) => {
      for (var i = 0; i < this.inputs.length; i++) {
        if (this.inputs[i] === input) {
          this.inputs.splice(i, 1)
        }
      }
    })

    configuredInputs.forEach((input) => {
      tvService.addLinkedService(input)
    })

    this.registerAccessories()
  }

  mapType (type) {
    switch (type) {
      case 'TV':
        return 'TV'
      case 'HDMI':
        return 'HDMI'
      case 'YOUTUBE':
        return 'APPLICATION'
      case 'TUNEIN':
        return 'APPLICATION'
      case 'DEEZER':
        return 'APPLICATION'
      case 'SPOTIFY':
        return 'APPLICATION'
      case 'AIRPLAY':
        return 'AIRPLAY'
      default:
        return 'OTHER'
    }
  }

  parseInputs () {
    // ugly synchronous call to device info. Need to figure out a better way of doing this
    var response
    var counter = 1

    try {
      response = JSON.parse(syncrequest('GET', this.sourceUrl).getBody())
    } catch {
      this.log('Reading source input info failed')
    }

    response.sources.forEach((source) => {
      const entry = {
        name: source[1].friendlyName,
        type: this.mapType(source[1].sourceType.type),
        apiID: source[1].id
      }
      this.inputs.push(entry)

      // if this is a TV, ensure that we are using the input method of powering on
      if (source[1].sourceType.type === 'TV' && this.on === 'on') {
        this.on = 'input'
      }
      counter = counter + 1
    })
  }

  determineInputType (type) {
    switch (type) {
      case 'TV':
        return Characteristic.InputSourceType.TUNER
      case 'HDMI':
        return Characteristic.InputSourceType.HDMI
      case 'APPLICATION':
        return Characteristic.InputSourceType.APPLICATION
      case 'AIRPLAY':
        return Characteristic.InputSourceType.AIRPLAY
      default:
        return Characteristic.InputSourceType.OTHER
    }
  }

  lookupInput (lookup) {
    var match = ''
    this.inputs.forEach((input) => {
      if (input.apiID === lookup) {
        match = input.name
      }
    })
    return match
  }

  getAccessory (accessoryType) {
    // get cached accessories that match
    const deviceid = UUIDGen.generate(this.name + this.ip + this.type)
    let newAccessory = this.unusedDeviceAccessories.find(function (a) { return (a.context.kind === accessoryType) && (a.context.id === deviceid) })
    if (newAccessory) {
      // already been loaded from cache
      this.unusedDeviceAccessories.splice(this.unusedDeviceAccessories.indexOf(newAccessory), 1)
    } else {
      // create the accessory
      const id = UUIDGen.generate(this.name + this.ip + this.type)
      if (this.debug) this.log.info('Adding new accessory with id ' + id + ' and kind ' + accessoryType)
      newAccessory = new Accessory(this.name, UUIDGen.generate(this.name + this.ip + this.type + accessoryType))
      newAccessory.context.id = id
      newAccessory.context.kind = accessoryType
      if (newAccessory.context.kind === 'tv') {
        // TV's are external accessories
        this.externalDeviceAccessories.push(newAccessory)
      } else {
        // Everything else will be published on the bridge
        this.newDeviceAccessories.push(newAccessory)
      }
    }
    // update accessory information
    let informationService = newAccessory.getService(Service.AccessoryInformation)
    if (!informationService) {
      informationService = newAccessory.addService(Service.AccessoryInformation)
    }

    informationService
      .setCharacteristic(Characteristic.Manufacturer, 'Bang & Olufsen')
      .setCharacteristic(Characteristic.Model, this.model)
      .setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
      .setCharacteristic(Characteristic.FirmwareRevision, PLUGIN_VERSION)

    this.deviceAccessories.push(newAccessory)
    return newAccessory
  }

  registerAccessories () {
    // Registers any newly created accessories
    if (this.newDeviceAccessories) this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, this.newDeviceAccessories)

    // Register external devices (e.g. TVs). This will happen each time as they are not cached
    if (this.externalDeviceAccessories) this.api.publishExternalAccessories(PLUGIN_NAME, this.externalDeviceAccessories)

    // Removes all unused accessories
    for (let i = 0; i < this.unusedDeviceAccessories.length; i++) {
      const unusedDeviceAccessory = this.unusedDeviceAccessories[i]
      if (this.debug) this.log.info('Removing unused accessory with id ' + (this.name + this.ip + this.type) + ' and kind ' + unusedDeviceAccessory.context.kind + '.')
      this.accessories.splice(this.accessories.indexOf(unusedDeviceAccessory), 1)
    }
    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, this.unusedDeviceAccessories)
  }

  async getMuteState (callback) {
    const response = await this._httpRequest(this.mute.statusUrl, null, 'GET')

    if (!response) {
      this.log('getMuteState() failed')
      callback(new Error('getMuteState() failed'))
    } else {
      const muted = response.body.volume.speaker.muted
      this.log('[%s] Speaker is currently %s', this.name, muted ? 'MUTED' : 'NOT MUTED')

      if (this.type === 'speaker') {
        // return the mute state correctly
        callback(null, muted)
      } else {
        // return the inverse
        callback(null, !muted)
      }
    }
  }

  async setMuteState (muted, callback) {
    var muteBody = {
      muted: muted
    }

    if (this.type !== 'speaker') {
      // if not a speaker, we need to invert the state we are setting
      muteBody.muted = !muted
    }

    const response = await this._httpRequest(this.mute.setUrl, muteBody, 'PUT')

    if (!response) {
      this.log('setMuteState() failed')
      callback(new Error('setMuteState() failed'))
    } else {
      this.log('[%s] Mute state set to %s', this.name, muteBody.muted ? 'MUTED' : 'NOT MUTED')
      callback(undefined, response.body)
    }
  }

  async getPowerState (callback) {
    const response = await this._httpRequest(this.power.statusUrl, null, 'GET')

    if (!response) {
      this.log('getPowerState() request failed')
      callback(null)
    } else {
      const power = response.body.profile.powerManagement.standby.powerState
      this.log('[%s] Device is currently %s', this.name, power)

      var state
      if (power === 'on') {
        state = true
      } else {
        state = false
      }
      this.currentPowerState = state

      if (callback) {
        if (this.type === 'speaker') {
          // return the power state reversed
          callback(null, !state)
        } else {
          // return correctly
          callback(null, state)
        }
      }
    }
  }

  async setPowerState (power, callback) {
    // Check if the device is already on
    await this.getPowerState()
    if (this.currentPowerState && (power === 1 || power === true)) {
      // Device is already on - return
      callback(null)
    } else {
      // If selected, we turn on by setting an input
      if (this.on === 'input' && (power === 1 || power === true)) {
        this.log('[%s] Powering on via setting input %d', this.name, this.default)
        this.setInput(this.default, callback)
      } else if (this.on === 'join' && (power === 1 || power === true)) {
        this.log('[%s] Powering on via joining experience', this.name)
        const response = await this._httpRequest(this.join.joinUrl, null, 'POST')
        if (!response) {
          this.log('setPowerState() join request failed')
        }
        callback(null)
      } else { // If not use the API
        var powerBody = {
          standby: {
            powerState: power ? 'on' : 'standby'
          }
        }

        if (this.type === 'speaker') {
          // if a speaker, we need to invert the state we are setting
          powerBody.standby.powerState = !power ? 'on' : 'standby'
        }

        const response = await this._httpRequest(this.power.setUrl, powerBody, 'PUT')
        if (!response) {
          this.log('setPowerState() request failed')
          callback(new Error('setPowerState() failed'))
        } else {
          if (this.type === 'speaker') {
            this.log('[%s] Power state set to %s', this.name, !power ? 'ON' : 'STANDBY')
          } else {
            this.log('[%s] Power state set to %s', this.name, power ? 'ON' : 'STANDBY')
          }
          callback(undefined, response.body)
        }
      }
    }
  }

  async getVolume (callback) {
    const response = await this._httpRequest(this.volume.statusUrl, null, 'GET')

    if (!response) {
      this.log('getVolume() request failed')
      if (callback) {
        callback(new Error('getVolume() failed'))
      }
    } else {
      const volume = parseInt(response.body.volume.speaker.level)
      this.log('[%s] Volume is at %s %', this.name, volume)

      this.currentVolume = volume
      this.maxVolume = parseInt(response.body.volume.speaker.range.maximum)
      this.log('[%s] Maximum volume is set to %s %', this.name, this.maxVolume)
      if (callback) {
        callback(null, volume)
      }
    }
  }

  async setVolume (volume, callback) {
    if (volume > this.maxVolume) {
      volume = this.maxVolume
    }

    var volumeBody = {
      level: volume
    }

    const response = await this._httpRequest(this.volume.setUrl, volumeBody, 'PUT')

    if (!response) {
      this.log('setVolume() request failed')
      if (callback) {
        callback(new Error('setVolume() failed'))
      }
    } else {
      this.log('[%s] Volume set to %s', this.name, volume)
      this.currentVolume = volume
      if (callback) {
        callback(undefined, response.body)
      }
    }
  }

  async setVolumeSwitch (state, callback, isUp) {
    this.log('[%s] Volume %s pressed, current volume: %s, limit: %s', this.name, isUp ? 'Up' : 'Down', this.currentVolume, this.maxVolume)
    const volLevel = this.currentVolume
    if (isUp) {
      if (volLevel < this.maxVolume) {
        this.setVolume(this.currentVolume + 1)
      }
    } else {
      if (volLevel > 0) {
        this.setVolume(this.currentVolume - 1)
      }
    }
    callback(null)
  }

  async getInput (callback) {
    const response = await this._httpRequest(this.input.statusUrl, null, 'GET')

    if (!response) {
      this.log('getInput() request failed')
      callback(new Error('getInput() failed'))
    } else {
      const input = response.body.activeSources.primary

      if (input) {
        this.log('[%s] Active input is %s', this.name, this.lookupInput(input))
      } else {
        this.log('[%s] No active input currently set', this.name)
      }

      const index = this.inputs.findIndex(function (x) {
        return x.apiID === input
      })
      if (index === -1) { // the current input wasn't found. User hasn't defined?
        callback(null, 1)
      } else {
        callback(null, index + 1)
      }
    }
  }

  async setInput (desiredInput, callback) {
    const input = this.inputs[desiredInput - 1]

    var inputBody = {
      primaryExperience: {
        source: {
          id: input.apiID,
          friendlyName: '',
          product: {
            jid: this.jid,
            friendlyName: ''
          }
        }
      }
    }

    const response = await this._httpRequest(this.input.setUrl, inputBody, 'POST')

    if (!response) {
      this.log('setInput() request failed')
      callback(new Error('setInput() failed'))
    } else {
      this.log('[%s] Input set to %s', this.name, input.name)
      callback(null, input)
    }
  }

  remoteControl (action, callback) {
    switch (action) {
      case 0: // Rewind
        this.log('[%s] REW', this.name)
        break
      case 1: // Fast Forward
        this.log('[%s] FF', this.name)
        break
      case 2: // Next Track
        this.log('[%s] SKIP_NEXT', this.name)
        break
      case 3: // Previous Track
        this.log('[%s] SKIP_PREV', this.name)
        break
      case 4: // Up Arrow
        this.log('[%s] UP', this.name)
        break
      case 5: // Down Arrow
        this.log('[%s] DOWN', this.name)
        break
      case 6: // Left Arrow
        this.log('[%s] LEFT', this.name)
        break
      case 7: // Right Arrow
        this.log('[%s] RIGHT', this.name)
        break
      case 8: // Select
        this.log('[%s] ENTER', this.name)
        break
      case 9: // Back
        this.log('[%s] RETURN', this.name)
        break
      case 10: // Exit
        this.log('[%s] CANCEL', this.name)
        break
      case 11: // Play / Pause
        this.log('[%s] PLAY', this.name)
        break
      case 15: // Information
        this.log('[%s] HOME', this.name)
        break
    }

    callback(null)
  }

  async _httpRequest (url, body, method) {
    var options = {
      method: method,
      responseType: 'json'
    }

    if (this.debug) {
      options.agent = {
        http: tunnel.httpOverHttp({
          proxy: {
            host: this.debugproxy,
            port: 8080
          }
        })
      }
    }

    if (body !== null) {
      options.json = body
    }

    try {
      const response = await got(url, options)
      return response
    } catch (error) {
      this.log('Error on HTTP request')
      if (this.debug) this.log.debug(error)
      return null
    }
  }
}

module.exports = BeoplayPlatformDevice
