'use strict'

const isip = require('is-ip')
const got = require('got')
const util = require('util')
const syncrequest = require('sync-request')
const tunnel = require('tunnel')

const {
  PLUGIN_VERSION
} = require('./Constants')

let Characteristic, Service

class BeoplayDevice {
  constructor (log, config, api) {
    this.log = log
    this.api = api
    this.services = []
    this.startupError = null

    this.name = config.name || 'B&O Device'

    Characteristic = api.hap.Characteristic
    Service = api.hap.Service

    try {
      if (!isip(config.ip)) throw new Error(`IP address is required for device ${config.name}`)
    } catch (error) {
      this.logError(error)
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
    this.jid = ''

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
      const res = syncrequest('GET', this.deviceUrl)
      const response = JSON.parse(res.getBody())
      this.model = response.beoDevice.productId.productType
      this.serialNumber = response.beoDevice.productId.serialNumber
      this.jid = res.headers['device-jid']
    } catch {
      // can't parse the device info - fail gracefully
      this.log('Reading device info failed. Have you supplied the correct IP address?')
      return
    }

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

    this.prepareInformationService()

    if ((!this.inputs.length) && this.on === 'input') {
      // if no user supplied or parsed inputs and the user wants to power on this way
      this.parseInputs()
    }
  }

  prepareInformationService () {
    const informationService = new Service.AccessoryInformation()

    informationService
      .setCharacteristic(Characteristic.Manufacturer, 'Bang & Olufsen')
      .setCharacteristic(Characteristic.Model, this.model)
      .setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
      .setCharacteristic(Characteristic.FirmwareRevision, PLUGIN_VERSION)

    this.services.push(informationService)
  }

  prepareSpeakerService () {
    this.log('Creating speaker')
    const speakerService = new Service.Speaker(this.name)

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

    // add a volume setting to the speaker (not supported in the Home app or by Siri)
    speakerService
      .addCharacteristic(new Characteristic.Volume())
      .on('get', this.getVolume.bind(this))
      .on('set', this.setVolume.bind(this))

    this.services.push(speakerService)
  }

  prepareBulbService () {
    this.log('Creating bulb')
    const bulbService = new Service.Lightbulb(this.name)

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

    this.services.push(bulbService)
  }

  prepareFanService () {
    this.log('Creating fan')
    const fanService = new Service.Fan(this.name)

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

    this.services.push(fanService)
  }

  async prepareTvService () {
    this.log('Creating tv')

    // Configure TV Accessory
    const tvService = new Service.Television(this.name, 'tvService')

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

    this.services.push(tvService)

    // Configuring Volume control
    this.log('Creating tv speaker')

    const tvSpeakerService = new Service.TelevisionSpeaker(this.name + ' Volume', 'volumeService')

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
    this.services.push(tvSpeakerService)

    this.getVolume()

    // Configure TV inputs

    if (!this.inputs.length) {
      // if the user hasn't supplied their own inputs
      this.parseInputs()
    }

    const configuredInputs = this.setupInputs()
    configuredInputs.forEach((input) => {
      tvService.addLinkedService(input)
      this.services.push(input)
    })
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
    let response
    let counter = 1

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

  setupInputs () {
    const configuredInputs = []
    let counter = 1
    const excluded = []

    this.inputs.forEach((input) => {
      if (this.exclude.includes(input.apiID)) {
        // this entry is on the exclude list
        this.log('Excluded input: ' + input.name)
        excluded.push(input)
      } else {
        const name = input.name
        const type = this.determineInputType(input.type)

        configuredInputs.push(this.createInputSource(name, counter, type))
        this.log('Added input ' + counter + ', Name: ' + name)
        counter = counter + 1
      }
    })
    // sense check the default input selected before we return
    if (this.default > counter) {
      this.default = counter - 1
      this.log('Default input out of range. Changed to input ' + this.default)
    }

    // remove excluded inputs from the list of inputs
    excluded.forEach((input) => {
      for (let i = 0; i < this.inputs.length; i++) {
        if (this.inputs[i] === input) {
          this.inputs.splice(i, 1)
        }
      }
    })

    return configuredInputs
  }

  createInputSource (name, number, type) {
    const input = new Service.InputSource(name.toLowerCase().replace(' ', ''), name)
    input
      .setCharacteristic(Characteristic.Identifier, number)
      .setCharacteristic(Characteristic.ConfiguredName, name)
      .setCharacteristic(Characteristic.InputSourceType, type)
      .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)

    return input
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
    let match = ''
    this.inputs.forEach((input) => {
      if (input.apiID === lookup) {
        match = input.name
      }
    })
    return match
  }

  async getMuteState (callback) {
    const response = await this._httpRequest(this.mute.statusUrl, null, 'GET')

    if (!response) {
      this.log('getMuteState() failed')
      callback(null)
    } else {
      const muted = response.body.volume.speaker.muted
      this.log('Speaker is currently %s', muted ? 'MUTED' : 'NOT MUTED')

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
    const muteBody = {
      muted: muted
    }

    if (this.type !== 'speaker') {
      // if not a speaker, we need to invert the state we are setting
      muteBody.muted = !muted
    }

    const response = await this._httpRequest(this.mute.setUrl, muteBody, 'PUT')

    if (!response) {
      this.log('setMuteState() failed')
      callback(null)
    } else {
      this.log('Mute state set to %s', muteBody.muted ? 'MUTED' : 'NOT MUTED')
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
      this.log('Device is currently %s', power)

      let state
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
        this.log('Powering on via setting input %d', this.default)
        this.setInput(this.default, callback)
      } else { // If not use the API
        const powerBody = {
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
          callback(null)
        } else {
          if (this.type === 'speaker') {
            this.log('Power state set to %s', !power ? 'ON' : 'STANDBY')
          } else {
            this.log('Power state set to %s', power ? 'ON' : 'STANDBY')
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
        callback(null)
      }
    } else {
      const volume = parseInt(response.body.volume.speaker.level)
      this.log('Volume is at %s %', volume)

      this.currentVolume = volume
      this.maxVolume = parseInt(response.body.volume.speaker.range.maximum)
      this.log('Maximum volume is set to %s %', this.maxVolume)
      if (callback) {
        callback(null, volume)
      }
    }
  }

  async setVolume (volume, callback) {
    if (volume > this.maxVolume) {
      volume = this.maxVolume
    }

    const volumeBody = {
      level: volume
    }

    const response = await this._httpRequest(this.volume.setUrl, volumeBody, 'PUT')

    if (!response) {
      this.log('setVolume() request failed')
      if (callback) {
        callback(null)
      }
    } else {
      this.log('Volume set to %s', volume)
      this.currentVolume = volume
      if (callback) {
        callback(undefined, response.body)
      }
    }
  }

  async setVolumeSwitch (state, callback, isUp) {
    this.log('Volume %s pressed, current volume: %s, limit: %s', isUp ? 'Up' : 'Down', this.currentVolume, this.maxVolume)
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
      callback(null)
    } else {
      const input = response.body.activeSources.primary

      if (input) {
        this.log('Active input is %s', this.lookupInput(input))
      } else {
        this.log('No active input currently set')
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

    const inputBody = {
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
      callback(null)
    } else {
      this.log('Input set to %s', input.name)
      callback(null, input)
    }
  }

  remoteControl (action, callback) {
    switch (action) {
      case 0: // Rewind
        this.log('REW')
        break
      case 1: // Fast Forward
        this.log('FF')
        break
      case 2: // Next Track
        this.log('SKIP_NEXT')
        break
      case 3: // Previous Track
        this.log('SKIP_PREV')
        break
      case 4: // Up Arrow
        this.log('UP')
        break
      case 5: // Down Arrow
        this.log('DOWN')
        break
      case 6: // Left Arrow
        this.log('LEFT')
        break
      case 7: // Right Arrow
        this.log('RIGHT')
        break
      case 8: // Select
        this.log('ENTER')
        break
      case 9: // Back
        this.log('RETURN')
        break
      case 10: // Exit
        this.log('CANCEL')
        break
      case 11: // Play / Pause
        this.log('PLAY')
        break
      case 15: // Information
        this.log('HOME')
        break
    }

    callback(null)
  }

  async _httpRequest (url, body, method) {
    const options = {
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
      this.log(error)
      return null
    }
  }

  logInfo (message, ...args) {
    this.log.info((this.name ? `[${this.name}] ` : '') + message, ...args)
  }

  logDebug (message, ...args) {
    this.log.debug((this.name ? `[${this.name}] ` : '') + message, ...args)
  }

  logError (message, ...args) {
    this.log.error((this.name ? `[${this.name}] ` : '') + message, ...args)
  }
}

module.exports = BeoplayDevice
