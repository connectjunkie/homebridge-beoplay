'use strict'

// Represents each Beoplay device you have loaded via the platform
const isip = require('is-ip')
const got = require('got')
const util = require('util')
const syncrequest = require('sync-request')
const tunnel = require('tunnel')
const ndjson = require('ndjson')

const {
  PLUGIN_VERSION,
  PLATFORM_NAME,
  PLUGIN_NAME
} = require('./Constants')

let notifyStream

let Characteristic, Service, Accessory, UUIDGen, Categories
let beoplayAccessory

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

    // these options are not exposed in the UI
    this.interval = config.interval || 60000
    this.debug = config.debug || false
    this.debugproxy = config.debugproxy
    this.debugproxyport = config.debugproxyport || 8080

    if (this.inputs.length && this.exclude.length) {
      // user has supplied both an inputs values and an exclude value. Ignore the excludes value
      this.exclude = []
    }

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
    this.notifyUrl = this.baseUrl + '/BeoNotify/Notifications'

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
    this.getPowerState()
    this.createNotificationListener()

    const scope = this

    setInterval(function reset () {
      scope.closeNotificationListener()
      scope.getPowerState()
      scope.createNotificationListener()
    }, this.interval)
  }

  closeNotificationListener () {
    if (notifyStream) {
      if (this.debug) this.log.debug('Closing notification stream')
      try {
        notifyStream.destroy()
      } catch (error) {
        this.log.error('Error on closing notification stream')
        if (this.debug) this.log.debug(error)
      }
    }
  }

  createNotificationListener () {
    if (this.debug) this.log.debug('Connecting to notification stream')
    const scope = this
    const options = {}

    if (this.debugproxy) {
      options.agent = {
        http: tunnel.httpOverHttp({
          proxy: {
            host: this.debugproxy,
            port: this.debugproxyport
          }
        })
      }
    }

    try {
      notifyStream = got.stream(this.notifyUrl, options)
    } catch (error) {
      this.log.error('Error connecting to the notification stream')
      if (this.debug) this.log.debug(error)
    }

    notifyStream.pipe(ndjson.parse())
      .on('data', function (msg) {
        switch (msg.notification.type) {
          case 'VOLUME':
            scope.updateVolume(
              msg.notification.data.speaker.level,
              msg.notification.data.speaker.range.maximum
            )
            scope.updateMuteState(msg.notification.data.speaker.muted)
            break
          case 'SOURCE':
            if (scope.type === 'tv') {
              scope.updateInput(msg.notification.data.primary)
            }
            break
          case 'NOW_PLAYING_STORED_MUSIC':
            break
          case 'SHUTDOWN':
            scope.updatePowerState(false)
            break
          case 'PROGRESS_INFORMATION':
            if (beoplayAccessory.context.currentPowerState !== true && msg.notification.data.state !== 'stop') {
              scope.updatePowerState(true)
            }
            break
          case 'NOW_PLAYING_NET_RADIO':
            break
        }
      })
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
      this.log.error('Reading device info failed. Have you supplied the correct IP address?')
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
      this.log.error('Incorrect value for "type" specified')
      return
    }

    if ((!this.inputs.length) && this.on === 'input') {
      // if no user supplied or parsed inputs and the user wants to power on this way
      this.parseInputs()
    }
  }

  prepareSpeakerService () {
    if (this.debug) this.log.debug('Creating speaker')

    beoplayAccessory = this.getAccessory('speaker')

    this.registerAccessories()

    let speakerService = beoplayAccessory.getService(Service.Speaker)
    if (!speakerService) {
      if (this.debug) this.log.debug('Adding speaker service')
      speakerService = beoplayAccessory.addService(Service.Speaker)
    }

    if (this.mode === 'mute') { // we will mute the speaker when muted
      speakerService
        .getCharacteristic(Characteristic.Mute)
        .on('set', this.setMuteState.bind(this))
    } else { // we will put speaker in standby when muted
      speakerService
        .getCharacteristic(Characteristic.Mute)
        .on('set', this.setPowerState.bind(this))
    }

    if (speakerService.getCharacteristic(Characteristic.Volume)) {
      speakerService
        .getCharacteristic(Characteristic.Volume)
        .on('set', this.setVolume.bind(this))
    } else {
      // add a volume setting to the speaker (not supported in the Home app or by Siri)
      speakerService
        .addCharacteristic(new Characteristic.Volume())
        .on('set', this.setVolume.bind(this))
    }
  }

  prepareBulbService () {
    if (this.debug) this.log.debug('Creating bulb')

    beoplayAccessory = this.getAccessory('bulb')

    this.registerAccessories()

    let bulbService = beoplayAccessory.getService(Service.Lightbulb)
    if (!bulbService) {
      if (this.debug) this.log.debug('Adding bulb service')
      bulbService = beoplayAccessory.addService(Service.Lightbulb)
    }

    if (this.mode === 'mute') { // we will mute the speaker when turned off
      bulbService
        .getCharacteristic(Characteristic.On)
        .on('set', this.setMuteState.bind(this))
    } else { // we will put speaker in standby when turned off
      bulbService
        .getCharacteristic(Characteristic.On)
        .on('set', this.setPowerState.bind(this))
    }

    // bind brightness setting to volume
    bulbService
      .getCharacteristic(Characteristic.Brightness)
      .on('set', this.setVolume.bind(this))
  }

  prepareFanService () {
    if (this.debug) this.log.debug('Creating fan')

    beoplayAccessory = this.getAccessory('fan')

    this.registerAccessories()

    let fanService = beoplayAccessory.getService(Service.Fan)
    if (!fanService) {
      if (this.debug) this.log.debug('Adding fan service')
      fanService = beoplayAccessory.addService(Service.Fan)
    }

    if (this.mode === 'mute') { // we will mute the device when turned off
      fanService
        .getCharacteristic(Characteristic.On)
        .on('set', this.setMuteState.bind(this))
    } else { // we will put device in standby when turned off
      fanService
        .getCharacteristic(Characteristic.On)
        .on('set', this.setPowerState.bind(this))
    }

    // bind rotation speed setting to volume
    fanService
      .getCharacteristic(Characteristic.RotationSpeed)
      .on('set', this.setVolume.bind(this))
  }

  async prepareTvService () {
    if (this.debug) this.log.debug('Creating tv')

    beoplayAccessory = this.getAccessory('tv')
    beoplayAccessory.category = Categories.TELEVISION

    let tvService = beoplayAccessory.getService(Service.Television)
    if (!tvService) {
      if (this.debug) this.log.debug('Adding tv service')
      tvService = beoplayAccessory.addService(Service.Television)
    }

    tvService
      .setCharacteristic(Characteristic.ConfiguredName, this.name)
      .setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE)

    if (this.mode === 'mute') { // we will mute the TV instead of turning off
      tvService
        .getCharacteristic(Characteristic.Active)
        .on('set', this.setMuteState.bind(this))
    } else { // default for TV - power on/off
      tvService
        .getCharacteristic(Characteristic.Active)
        .on('set', this.setPowerState.bind(this))
    }

    tvService
      .getCharacteristic(Characteristic.ActiveIdentifier)
      .on('set', this.setInput.bind(this))

    // Configure Remote Control (not currently implemented)
    tvService
      .getCharacteristic(Characteristic.RemoteKey)
      .on('set', this.remoteControl.bind(this))

    // Configuring Volume control
    if (this.debug) this.log.debug('Creating tv speaker')

    let tvSpeakerService = beoplayAccessory.getService(Service.TelevisionSpeaker)
    if (!tvSpeakerService) {
      if (this.debug) this.log.debug('Adding tv speaker service')
      tvSpeakerService = beoplayAccessory.addService(Service.TelevisionSpeaker)
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
      .on('set', this.setMuteState.bind(this))

    tvSpeakerService
      .addCharacteristic(Characteristic.Volume)
      .on('set', this.setVolume.bind(this))

    tvService.addLinkedService(tvSpeakerService)

    // Configure TV inputs

    if (!this.inputs.length) {
      // if the user hasn't supplied their own inputs
      this.parseInputs()
    }

    const configuredInputs = []
    let counter = 1
    const excluded = []

    this.inputs.forEach((input) => {
      if (this.exclude.includes(input.apiID)) {
      // this entry is on the exclude list
        if (this.debug) this.log.debug('Excluded input: ' + input.name)
        excluded.push(input)
      } else {
        const name = input.name
        const type = this.determineInputType(input.type)

        let inputService = beoplayAccessory.getService(name.toLowerCase().replace(' ', ''))
        if (!inputService) {
          inputService = beoplayAccessory.addService(Service.InputSource, name.toLowerCase().replace(' ', ''), name)
        }

        inputService
          .setCharacteristic(Characteristic.Identifier, counter)
          .setCharacteristic(Characteristic.ConfiguredName, name)
          .setCharacteristic(Characteristic.InputSourceType, type)
          .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)

        configuredInputs.push(inputService)
        if (this.debug) this.log.debug('Added input ' + counter + ', Name: ' + name)
        counter = counter + 1
      }
    })
    // sense check the default input selected
    if (this.default > counter) {
      this.default = counter - 1
      this.log.warn('Default input out of range. Changed to input ' + this.default)
    }

    // remove excluded inputs from the list of inputs
    excluded.forEach((input) => {
      for (let i = 0; i < this.inputs.length; i++) {
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
    let response
    let counter = 1

    try {
      response = JSON.parse(syncrequest('GET', this.sourceUrl).getBody())
    } catch {
      this.log.error('Reading source input info failed')
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

  lookupInputName (lookup) {
    let match = ''
    this.inputs.forEach((input) => {
      if (input.apiID === lookup) {
        match = input.name
      }
    })
    return match
  }

  lookupInputIndex (inputID) {
    const index = this.inputs.findIndex(function (x) {
      return x.apiID === inputID
    })
    return index
  }

  getAccessory (accessoryType) {
    // get cached accessories that match
    const deviceid = UUIDGen.generate(this.name + this.ip + this.type)
    let newAccessory = this.unusedDeviceAccessories.find(function (a) { return (a.context.kind === accessoryType) && (a.context.id === deviceid) })
    if (newAccessory) {
      // already been loaded from cache
      if (this.debug) this.log.info('Using cached accessory with id ' + newAccessory.context.id)
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

  async setMuteState (muted, callback) {
    if (this.debug) this.log.debug('[%s] Setting Mute State to %s', this.name, muted)
    const muteBody = {
      muted: muted
    }

    if (this.type !== 'speaker') {
      // if not a speaker, we need to invert the state we are setting
      muteBody.muted = !muted
    }

    const response = await this._httpRequest(this.mute.setUrl, muteBody, 'PUT')

    if (!response) {
      this.log.error('setMuteState() failed')
      callback(null)
    } else {
      this.log.info('[%s] Mute state set to %s', this.name, muteBody.muted ? 'MUTED' : 'NOT MUTED')
      beoplayAccessory.context.currentMuteState = muted
      callback(null)
    }
  }

  updateMuteState (muted) {
    if (beoplayAccessory.context.currentMuteState === muted) return

    this.log.info('[%s] Updating Mute State to %s', this.name, muted)
    beoplayAccessory.context.currentMuteState = muted

    if (this.type === 'speaker') {
      beoplayAccessory.getService(Service.Speaker)
        .getCharacteristic(Characteristic.Mute)
        .updateValue(beoplayAccessory.context.currentMuteState)
    } else if (this.type === 'bulb' && this.mode === 'mute') {
      beoplayAccessory.getService(Service.Lightbulb)
        .getCharacteristic(Characteristic.On)
        .updateValue(!beoplayAccessory.context.currentMuteState)
    } else if (this.type === 'fan' && this.mode === 'mute') {
      beoplayAccessory.getService(Service.Fan)
        .getCharacteristic(Characteristic.On)
        .updateValue(!beoplayAccessory.context.currentMuteState)
    } else if (this.type === 'tv') {
      beoplayAccessory.getService(Service.TelevisionSpeaker)
        .getCharacteristic(Characteristic.Mute)
        .updateValue(beoplayAccessory.context.currentMuteState)
    }
  }

  async getPowerState () {
    const response = await this._httpRequest(this.power.statusUrl, null, 'GET')

    if (!response) {
      this.log.error('getPowerState() request failed')
    } else {
      const power = response.body.profile.powerManagement.standby.powerState
      if (this.debug) this.log.debug('[%s] is currently %s', this.name, power)

      let state
      if (power === 'on') {
        state = true
      } else {
        state = false
      }

      if (beoplayAccessory.context.currentPowerState !== state) this.updatePowerState(state)
    }
  }

  async setPowerState (power, callback) {
    if (this.debug) this.log.debug('[%s] Setting Power State to %s', this.name, power)

    if (beoplayAccessory.context.currentPowerState && (power === 1 || power === true)) {
      // Device is already on - return
      callback(null)
    } else {
      // If selected, we turn on by setting an input
      if (this.on === 'input' && (power === 1 || power === true)) {
        this.log.info('[%s] Powering on via setting input %d', this.name, this.default)
        this.setInput(this.default, callback)
      } else if (this.on === 'join' && (power === 1 || power === true)) {
        this.log.info('[%s] Powering on via joining experience', this.name)
        const response = await this._httpRequest(this.join.joinUrl, null, 'POST')
        if (!response) {
          this.log.error('setPowerState() join request failed')
        }
        callback(null)
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
          this.log.error('setPowerState() request failed')
          callback(null)
        } else {
          this.log.info('[%s] Power state set to %s', this.name, powerBody.standby.powerState)
          this.powerState = powerBody.standby.powerState
          callback(undefined, response.body)
        }
      }
    }
  }

  updatePowerState (powerState) {
    this.log.info('[%s] Updating Power State to %s', this.name, powerState)
    beoplayAccessory.context.currentPowerState = powerState

    if (this.type === 'speaker') {
      beoplayAccessory.getService(Service.Speaker)
        .getCharacteristic(Characteristic.Mute)
        .updateValue(!beoplayAccessory.context.currentPowerState)
    } else if (this.type === 'bulb') {
      beoplayAccessory.getService(Service.Lightbulb)
        .getCharacteristic(Characteristic.On)
        .updateValue(beoplayAccessory.context.currentPowerState)
    } else if (this.type === 'fan') {
      beoplayAccessory.getService(Service.Fan)
        .getCharacteristic(Characteristic.On)
        .updateValue(beoplayAccessory.context.currentPowerState)
    } else if (this.type === 'tv') {
      beoplayAccessory.getService(Service.Television)
        .getCharacteristic(Characteristic.Active)
        .updateValue(beoplayAccessory.context.currentPowerState)
    }
  }

  async setVolume (volume, callback) {
    if (this.debug) this.log.debug('[%s] Setting Volume to %d', this.name, volume)

    if (volume > beoplayAccessory.context.maxVolume) {
      volume = beoplayAccessory.context.maxVolume
    }

    const volumeBody = {
      level: volume
    }

    const response = await this._httpRequest(this.volume.setUrl, volumeBody, 'PUT')

    if (!response) {
      this.log.error('setVolume() request failed')
      if (callback) {
        callback(null)
      }
    } else {
      this.log.info('[%s] Volume set to %s', this.name, volume)
      beoplayAccessory.context.currentVolume = volume
      if (callback) {
        callback(undefined, response.body)
      }
    }
  }

  updateVolume (level, maximum) {
    if ((beoplayAccessory.context.currentVolume === level) && (beoplayAccessory.context.maxVolume === maximum)) return

    this.log.info('[%s] Updating Volume to %d and limit to %d', this.name, level, maximum)
    beoplayAccessory.context.currentVolume = level
    beoplayAccessory.context.maxVolume = maximum

    if (this.type === 'speaker') {
      const speakerService = beoplayAccessory.getService(Service.Speaker)

      speakerService.getCharacteristic(Characteristic.Volume)
        .updateValue(beoplayAccessory.context.currentVolume)
    } else if (this.type === 'bulb') {
      beoplayAccessory.getService(Service.Lightbulb)
        .getCharacteristic(Characteristic.Brightness)
        .updateValue(beoplayAccessory.context.currentVolume)
    } else if (this.type === 'fan') {
      beoplayAccessory.getService(Service.Fan)
        .getCharacteristic(Characteristic.RotationSpeed)
        .updateValue(beoplayAccessory.context.currentVolume)
    } else if (this.type === 'tv') {
      beoplayAccessory.getService(Service.Television)
        .getCharacteristic(Characteristic.Volume)
        .updateValue(beoplayAccessory.context.currentVolume)
    }
  }

  async setVolumeSwitch (state, callback, isUp) {
    this.log.info('[%s] Volume %s pressed, current volume: %s, limit: %s', this.name, isUp ? 'Up' : 'Down', beoplayAccessory.context.currentVolume, beoplayAccessory.context.maxVolume)
    const volLevel = beoplayAccessory.context.currentVolume
    if (isUp) {
      if (volLevel < beoplayAccessory.context.maxVolume) {
        this.setVolume(volLevel + 1)
      }
    } else {
      if (volLevel > 0) {
        this.setVolume(beoplayAccessory.context.currentVolume - 1)
      }
    }
    callback(null)
  }

  async setInput (desiredInput, callback) {
    if (this.debug) this.log.debug('[%s] Setting Input to %d', this.name, desiredInput)

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
      this.log.error('setInput() request failed')
      callback(null)
    } else {
      this.log.info('[%s] Input set to %s', this.name, input.name)
      beoplayAccessory.context.activeInputID = input.apiID
      beoplayAccessory.context.activeInput = input.name
      callback(null, input)
    }
  }

  updateInput (inputID) {
    if (beoplayAccessory.context.activeInputID === inputID) return

    beoplayAccessory.context.activeInputID = inputID
    beoplayAccessory.context.activeInput = this.lookupInputIndex(inputID)
    this.log.info('[%s] Updating Input to %s', this.name, this.lookupInputName(inputID))

    beoplayAccessory.getService(Service.Television)
      .getCharacteristic(Characteristic.ActiveIdentifier)
      .updateValue(beoplayAccessory.context.activeInput + 1)
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
    const options = {
      method: method,
      responseType: 'json'
    }

    if (this.debugproxy) {
      options.agent = {
        http: tunnel.httpOverHttp({
          proxy: {
            host: this.debugproxy,
            port: this.debugproxyport
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
      this.log.error('Error on HTTP request')
      if (this.debug) this.log.debug(error)
      return null
    }
  }
}

module.exports = BeoplayPlatformDevice
