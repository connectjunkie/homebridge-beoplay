'use strict'

// Represents each Beoplay device you have loaded via the platform
const isip = require('is-ip')
const got = require('got')
const util = require('util')
const syncrequest = require('sync-request')
const tunnel = require('tunnel')
const ndjson = require('ndjson')

const {
  PLUGIN_VERSION
} = require('./Constants')

let notifyStream

let Characteristic, Service, Accessory, UUIDGen, Categories

class BeoplayPlatformDevice {
  constructor (platform, log, config, api) {
    this.platform = platform
    this.log = log
    this.api = api

    this.name = config.name || 'B&O Device'

    Characteristic = api.hap.Characteristic
    Service = api.hap.Service
    Categories = api.hap.Categories
    Accessory = api.platformAccessory
    UUIDGen = api.hap.uuid

    this.beoplayAccessory = Accessory

    try {
      if (!isip(config.ip)) throw new Error(`IP address for device ${config.name} is malformed or not valid. Exiting`)
    } catch (error) {
      this.log.error(error.message)
      return
    }

    if (config.type && !(config.type === 'tv' || config.type === 'speaker' || config.type === 'smartspeaker' || config.type === 'bulb' || config.type === 'fan')) {
      this.log.error(`Device type ${config.type} for device ${config.name} is malformed or not valid. Exiting`)
      return
    }

    if (config.mode && !(config.mode === 'power' || config.mode === 'mute')) {
      this.log.error(`Device mode ${config.mode} for device ${config.name} is malformed or not valid. Exiting`)
      return
    }

    if (config.on && !(config.on === 'on' || config.on === 'input' || config.on === 'join')) {
      this.log.error(`Device power on method ${config.on} for device ${config.name} is malformed or not valid. Exiting`)
      return
    }

    if (config.default && !(Number.isInteger(config.default) || Number.isInteger(parseInt(config.default)))) {
      this.log.error(`Default input value ${config.default} for device ${config.name} is malformed or not valid. Exiting`)
      return
    }

    if (config.inputs) {
      try {
        let counter = 1
        config.inputs.forEach((input) => {
          // are all the expected values there
          if (!(input.name && input.type && input.apiID)) throw new Error(`Input number ${counter} is not complete/well formed. Exiting`)
          // is the type an allowed value
          if (!['TV', 'HDMI', 'TUNER', 'APPLICATION', 'AIRPLAY', 'OTHER'].includes(input.type)) throw new Error(`Input type ${input.type} is not valid. Exiting`)
          // is the apiID value correctly formatted
          if (!this.isApi(input.apiID)) throw new Error(`Input apiID ${input.apiID} is invalid. Exiting`)
          counter = counter + 1
        })
      } catch (error) {
        this.log.error(error.message)
        return
      }
    }

    if (config.exclude) {
      try {
        config.exclude.forEach((exclude) => {
          if (!this.isApi(exclude)) throw new Error(`Exclusion apiID ${exclude} is invalid. Exiting`)
        })
      } catch (error) {
        this.log.error(error.message)
        return
      }
    }

    this.ip = config.ip
    this.type = config.type || 'speaker'
    this.mode = config.mode || ((this.type === 'tv') ? 'power' : 'mute')
    this.on = config.on || ((this.type === 'tv') ? 'input' : 'on')
    this.default = config.default || 1
    this.inputs = config.inputs || []
    this.exclude = config.exclude || []

    // these options are debugging/advanced tuning options not exposed in the UI
    this.interval = config.interval || 60000
    this.debug = config.debug || false
    this.debugproxy = config.debugproxy
    this.debugproxyport = config.debugproxyport || 8080

    if (!Number.isInteger(this.default)) this.default = parseInt(this.default)

    if (this.inputs.length && this.exclude.length) {
      // user has supplied both an inputs values and an exclude value. Ignore the excludes value
      this.exclude = []
    }

    this.volume = {}
    this.mute = {}
    this.power = {}
    this.input = {}
    this.join = {}
    this.media = {}
    this.jid = ''

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

    this.media.playUrl = this.baseUrl + '/BeoZone/Zone/Stream/Play'
    this.media.pauseUrl = this.baseUrl + '/BeoZone/Zone/Stream/Pause'
    this.media.forwardUrl = this.baseUrl + '/BeoZone/Zone/Stream/Forward'
    this.media.backUrl = this.baseUrl + '/BeoZone/Zone/Stream/Backward'
    this.media.stopUrl = this.baseUrl + '/BeoZone/Zone/Stream/Stop'

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
            if (scope.beoplayAccessory.context.currentPowerState !== true && msg.notification.data.state !== 'stop') {
              scope.updatePowerState(true)
            }
            if (msg.notification.data.state !== scope.beoplayAccessory.context.currentMediaState) {
              scope.updateCurrentMediaState(msg.notification.data.state)
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

  isApi (input) {
    const res = input.match(/^\w+:\d+\.\d+\.\d+@products\.bang-olufsen\.com$/)
    if (res) {
      return true
    } else {
      return false
    }
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

    if (this.type === 'speaker') {
      this.prepareSpeakerService()
    } else if (this.type === 'bulb') {
      this.prepareBulbService()
    } else if (this.type === 'tv') {
      this.prepareTvService()
    } else if (this.type === 'fan') {
      this.prepareFanService()
    } else if (this.type === 'smartspeaker') {
      this.prepareSmartSpeakerService()
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

    this.beoplayAccessory = this.getAccessory('speaker')

    let speakerService = this.beoplayAccessory.getService(Service.Speaker)
    if (!speakerService) {
      if (this.debug) this.log.debug('Adding speaker service')
      speakerService = this.beoplayAccessory.addService(Service.Speaker)
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

    this.beoplayAccessory = this.getAccessory('bulb')

    let bulbService = this.beoplayAccessory.getService(Service.Lightbulb)
    if (!bulbService) {
      if (this.debug) this.log.debug('Adding bulb service')
      bulbService = this.beoplayAccessory.addService(Service.Lightbulb)
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

    this.beoplayAccessory = this.getAccessory('fan')

    let fanService = this.beoplayAccessory.getService(Service.Fan)
    if (!fanService) {
      if (this.debug) this.log.debug('Adding fan service')
      fanService = this.beoplayAccessory.addService(Service.Fan)
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

  prepareSmartSpeakerService () {
    if (this.debug) this.log.debug('Creating smart speaker')

    this.beoplayAccessory = this.getAccessory('smartspeaker')
    this.beoplayAccessory.category = 26

    let smartSpeakerService = this.beoplayAccessory.getService(Service.SmartSpeaker)
    if (!smartSpeakerService) {
      if (this.debug) this.log.debug('Adding smart speaker service')
      smartSpeakerService = this.beoplayAccessory.addService(Service.SmartSpeaker)
    }

    smartSpeakerService
      .setCharacteristic(Characteristic.ConfiguredName, this.name)

    smartSpeakerService
      .getCharacteristic(Characteristic.Mute)
      .on('set', this.setMuteState.bind(this))

    smartSpeakerService
      .getCharacteristic(Characteristic.Volume)
      .on('set', this.setVolume.bind(this))

    smartSpeakerService
      .getCharacteristic(Characteristic.TargetMediaState)
      .on('set', this.setTargetMediaState.bind(this))
  }

  async prepareTvService () {
    if (this.debug) this.log.debug('Creating tv')

    this.beoplayAccessory = this.getAccessory('tv')
    this.beoplayAccessory.category = Categories.TELEVISION

    let tvService = this.beoplayAccessory.getService(Service.Television)
    if (!tvService) {
      if (this.debug) this.log.debug('Adding tv service')
      tvService = this.beoplayAccessory.addService(Service.Television)
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

    let tvSpeakerService = this.beoplayAccessory.getService(Service.TelevisionSpeaker)
    if (!tvSpeakerService) {
      if (this.debug) this.log.debug('Adding tv speaker service')
      tvSpeakerService = this.beoplayAccessory.addService(Service.TelevisionSpeaker)
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
      .getCharacteristic(Characteristic.Volume)
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

        let inputService = this.beoplayAccessory.getService(name.toLowerCase().replace(' ', ''))
        if (!inputService) {
          inputService = this.beoplayAccessory.addService(Service.InputSource, name.toLowerCase().replace(' ', ''), name)
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
    let newAccessory = this.platform.accessories.find(function (a) { return (a.UUID === deviceid) })
    if (newAccessory) {
      // already been loaded from cache
      if (this.debug) this.log.info('Using cached accessory with id ' + newAccessory.UUID)
    } else {
      // create the accessory
      if (this.debug) this.log.info('Adding new accessory with id ' + deviceid + ' and kind ' + accessoryType)
      newAccessory = new Accessory(this.name, deviceid)
      if (accessoryType === 'tv' || accessoryType === 'smartspeaker') {
        // TV's and SmartSpeakers are external accessories
        this.platform.externalDeviceAccessories.push(newAccessory)
      } else {
        // Everything else will be published on the bridge
        this.platform.newDeviceAccessories.push(newAccessory)
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

    return newAccessory
  }

  async setMuteState (muted, callback) {
    if (this.debug) this.log.debug('[%s] Setting Mute State to %s', this.name, muted)
    const muteBody = {
      muted: muted
    }

    if (this.type === 'fan' || this.type === 'bulb') {
      // if doesn't natively support mute, we need to invert the state we are setting
      muteBody.muted = !muted
    }

    const response = await this._httpRequest(this.mute.setUrl, muteBody, 'PUT')

    if (!response) {
      this.log.error('setMuteState() failed')
      if (callback) {
        callback(null)
      }
    } else {
      this.log.info('[%s] Mute state set to %s', this.name, muteBody.muted ? 'MUTED' : 'NOT MUTED')
      this.beoplayAccessory.context.currentMuteState = muteBody.muted
      if (callback) {
        callback(null)
      }
    }
  }

  updateMuteState (muted) {
    if (this.beoplayAccessory.context.currentMuteState === muted) return

    this.log.info('[%s] Updating Mute State to %s', this.name, muted)
    this.beoplayAccessory.context.currentMuteState = muted

    if (this.type === 'speaker' && this.mode === 'mute') {
      this.beoplayAccessory.getService(Service.Speaker)
        .getCharacteristic(Characteristic.Mute)
        .updateValue(this.beoplayAccessory.context.currentMuteState)
    } else if (this.type === 'smartspeaker') {
      this.beoplayAccessory.getService(Service.SmartSpeaker)
        .getCharacteristic(Characteristic.Mute)
        .updateValue(this.beoplayAccessory.context.currentMuteState)
    } else if (this.type === 'bulb' && this.mode === 'mute') {
      this.beoplayAccessory.getService(Service.Lightbulb)
        .getCharacteristic(Characteristic.On)
        .updateValue(!this.beoplayAccessory.context.currentMuteState)
    } else if (this.type === 'fan' && this.mode === 'mute') {
      this.beoplayAccessory.getService(Service.Fan)
        .getCharacteristic(Characteristic.On)
        .updateValue(!this.beoplayAccessory.context.currentMuteState)
    } else if (this.type === 'tv') {
      this.beoplayAccessory.getService(Service.TelevisionSpeaker)
        .getCharacteristic(Characteristic.Mute)
        .updateValue(this.beoplayAccessory.context.currentMuteState)
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

      if (this.beoplayAccessory.context.currentPowerState !== state) this.updatePowerState(state)
    }
  }

  async setPowerState (power, callback) {
    if (this.debug) this.log.debug('[%s] Setting Power State to %s', this.name, power)

    if (this.beoplayAccessory.context.currentPowerState && (power === 1 || power === true)) {
      // Device is already on - return
      callback(null)
    } else {
      // If selected, we turn on by setting an input
      if (this.on === 'input' && (power === 1 || power === true)) {
        this.log.info('[%s] Powering on via setting input %d', this.name, this.default)
        this.setInput(this.default, callback)
      } else if (this.on === 'join' && (power === 1 || power === true)) {
        this.log.info('[%s] Powering on via joining experience', this.name)
        this.joinExperience()
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
    this.beoplayAccessory.context.currentPowerState = powerState

    if (this.type === 'speaker' && this.mode === 'power') {
      this.beoplayAccessory.getService(Service.Speaker)
        .getCharacteristic(Characteristic.Mute)
        .updateValue(!this.beoplayAccessory.context.currentPowerState)
    } else if (this.type === 'bulb') {
      this.beoplayAccessory.getService(Service.Lightbulb)
        .getCharacteristic(Characteristic.On)
        .updateValue(this.beoplayAccessory.context.currentPowerState)
    } else if (this.type === 'fan') {
      this.beoplayAccessory.getService(Service.Fan)
        .getCharacteristic(Characteristic.On)
        .updateValue(this.beoplayAccessory.context.currentPowerState)
    } else if (this.type === 'tv') {
      this.beoplayAccessory.getService(Service.Television)
        .getCharacteristic(Characteristic.Active)
        .updateValue(this.beoplayAccessory.context.currentPowerState)
    }
  }

  async setVolume (volume, callback) {
    if (this.debug) this.log.debug('[%s] Setting Volume to %d', this.name, volume)

    if (volume > this.beoplayAccessory.context.maxVolume) {
      volume = this.beoplayAccessory.context.maxVolume
    }

    if (volume < 0) volume = 0

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
      this.beoplayAccessory.context.currentVolume = volume
      if (callback) {
        callback(undefined, response.body)
      }
    }
  }

  updateVolume (level, maximum) {
    if ((this.beoplayAccessory.context.currentVolume === level) && (this.beoplayAccessory.context.maxVolume === maximum)) return

    this.log.info('[%s] Updating Volume to %d and limit to %d', this.name, level, maximum)
    this.beoplayAccessory.context.currentVolume = level
    this.beoplayAccessory.context.maxVolume = maximum

    if (this.type === 'speaker') {
      this.beoplayAccessory.getService(Service.Speaker)
        .getCharacteristic(Characteristic.Volume)
        .updateValue(this.beoplayAccessory.context.currentVolume)
    } else if (this.type === 'smartspeaker') {
      this.beoplayAccessory.getService(Service.SmartSpeaker)
        .getCharacteristic(Characteristic.Volume)
        .updateValue(this.beoplayAccessory.context.currentVolume)
    } else if (this.type === 'bulb') {
      this.beoplayAccessory.getService(Service.Lightbulb)
        .getCharacteristic(Characteristic.Brightness)
        .updateValue(this.beoplayAccessory.context.currentVolume)
    } else if (this.type === 'fan') {
      this.beoplayAccessory.getService(Service.Fan)
        .getCharacteristic(Characteristic.RotationSpeed)
        .updateValue(this.beoplayAccessory.context.currentVolume)
    } else if (this.type === 'tv') {
      this.beoplayAccessory.getService(Service.TelevisionSpeaker)
        .getCharacteristic(Characteristic.Volume)
        .updateValue(this.beoplayAccessory.context.currentVolume)
    }
  }

  async setVolumeSwitch (state, callback, isUp) {
    this.log.info('[%s] Volume %s pressed, current volume: %s, limit: %s', this.name, isUp ? 'Up' : 'Down', this.beoplayAccessory.context.currentVolume, this.beoplayAccessory.context.maxVolume)
    const volLevel = this.beoplayAccessory.context.currentVolume
    if (isUp) {
      if (volLevel < this.beoplayAccessory.context.maxVolume) {
        this.setVolume(volLevel + 1)
      }
    } else {
      if (volLevel > 0) {
        this.setVolume(this.beoplayAccessory.context.currentVolume - 1)
      }
    }
    callback(null)
  }

  async setTargetMediaState (state, callback) {
    if (this.debug) this.log.debug('[%s] Setting Target Media State to %s', this.name, state)

    if (state === Characteristic.TargetMediaState.PLAY) {
      this.playMedia()
    }

    if (state === Characteristic.TargetMediaState.PAUSE) {
      this.pauseMedia()
    }

    callback(null)
  }

  updateCurrentMediaState (state) {
    if (this.beoplayAccessory.context.currentMediaState === state) return

    this.log.info('[%s] Updating Current Media State to %s', this.name, state)
    this.beoplayAccessory.context.currentMediaState = state

    if (this.type === 'smartspeaker') {
      const updatedState = this.lookupState(state)

      const smartSpeakerService = this.beoplayAccessory.getService(Service.SmartSpeaker)

      smartSpeakerService.getCharacteristic(Characteristic.CurrentMediaState)
        .updateValue(updatedState)
    }
  }

  lookupState (state) {
    switch (state) {
      case 'play':
        return Characteristic.CurrentMediaState.PLAY
      case 'pause':
        return Characteristic.CurrentMediaState.PAUSE
      case 'stop':
        return Characteristic.CurrentMediaState.STOP
      case 'preparing':
        return Characteristic.CurrentMediaState.LOADING
    }
  }

  togglePlayPause () {
    if (this.beoplayAccessory.context.currentMediaState === 'play') {
      this.pauseMedia()
    } else if (this.beoplayAccessory.context.currentMediaState === 'pause') {
      this.playMedia()
    }
  }

  toggleMuteState () {
    if (this.beoplayAccessory.context.currentMuteState === true) {
      this.setMuteState(false)
    } else if (this.beoplayAccessory.context.currentMuteState === false) {
      this.setMuteState(true)
    }
  }

  async joinExperience () {
    this.log.info('[%s] Joining Multiroom experience', this.name)
    const response = await this._httpRequest(this.join.joinUrl, null, 'POST')

    if (!response) {
      this.log.error('joinExperience() request failed')
    }
  }

  async leaveExperience () {
    this.log.info('[%s] Leaving Multiroom experience', this.name)
    const response = await this._httpRequest(this.join.leaveUrl, null, 'DELETE')

    if (!response) {
      this.log.error('leaveExperience() request failed')
    }
  }

  async playMedia () {
    const response = await this._httpRequest(this.media.playUrl, null, 'POST')

    if (!response) {
      this.log.error('playMedia() request failed')
    }
  }

  async pauseMedia () {
    const response = await this._httpRequest(this.media.pauseUrl, null, 'POST')

    if (!response) {
      this.log.error('pauseMedia() request failed')
    }
  }

  async stopMedia () {
    const response = await this._httpRequest(this.media.stopUrl, null, 'POST')

    if (!response) {
      this.log.error('stopMedia() request failed')
    }
  }

  async forwardMedia () {
    this.log.info('[%s] Forward', this.name)
    const response = await this._httpRequest(this.media.forwardUrl, null, 'POST')

    if (!response) {
      this.log.error('forwardMedia() request failed')
    }
  }

  async backMedia () {
    this.log.info('[%s] Back', this.name)
    const response = await this._httpRequest(this.media.backUrl, null, 'POST')

    if (!response) {
      this.log.error('backMedia() request failed')
    }
  }

  volumeUp () {
    this.setVolume(this.beoplayAccessory.context.currentVolume + 1)
  }

  volumeDown () {
    this.setVolume(this.beoplayAccessory.context.currentVolume - 1)
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
      this.beoplayAccessory.context.activeInputID = input.apiID
      this.beoplayAccessory.context.activeInput = input.name
      callback(null, input)
    }
  }

  updateInput (inputID) {
    if (this.beoplayAccessory.context.activeInputID === inputID) return

    this.beoplayAccessory.context.activeInputID = inputID
    this.beoplayAccessory.context.activeInput = this.lookupInputIndex(inputID)
    this.log.info('[%s] Updating Input to %s', this.name, this.lookupInputName(inputID))

    this.beoplayAccessory.getService(Service.Television)
      .getCharacteristic(Characteristic.ActiveIdentifier)
      .updateValue(this.beoplayAccessory.context.activeInput + 1)
  }

  remoteControl (action, callback) {
    switch (action) {
      case Characteristic.RemoteKey.REWIND:
        this.log('[%s] REW', this.name)
        break
      case Characteristic.RemoteKey.FAST_FORWARD:
        this.log('[%s] FF', this.name)
        break
      case Characteristic.RemoteKey.NEXT_TRACK:
        this.log('[%s] SKIP_NEXT', this.name)
        break
      case Characteristic.RemoteKey.PREVIOUS_TRACK:
        this.log('[%s] SKIP_PREV', this.name)
        break
      case Characteristic.RemoteKey.ARROW_UP:
        this.volumeUp()
        break
      case Characteristic.RemoteKey.ARROW_DOWN:
        this.volumeDown()
        break
      case Characteristic.RemoteKey.ARROW_LEFT:
        this.backMedia()
        break
      case Characteristic.RemoteKey.ARROW_RIGHT:
        this.forwardMedia()
        break
      case Characteristic.RemoteKey.SELECT:
        this.toggleMuteState()
        break
      case Characteristic.RemoteKey.BACK:
        this.leaveExperience()
        break
      case Characteristic.RemoteKey.EXIT:
        this.log('[%s] CANCEL', this.name)
        break
      case Characteristic.RemoteKey.PLAY_PAUSE:
        this.togglePlayPause()
        break
      case Characteristic.RemoteKey.INFORMATION:
        this.joinExperience()
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
