// Represents each Beoplay device you have loaded via the platform
import got from 'got'
import net from 'node:net'
import util from 'util'
import tunnel from 'tunnel'
import ndjson from 'ndjson'
import str from '@supercharge/strings'

import {
  PLATFORM_NAME,
  PLUGIN_NAME,
  PLUGIN_VERSION
} from './Constants.js'

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
    this.newDeviceAccessories = []
    this.externalDeviceAccessories = []
    this.unusedDeviceAccessories = []

    const scope = this
    let notifyStream // eslint-disable-line no-unused-vars

    try {
      if (!net.isIP(config.ip)) throw new Error(`IP address for device ${config.name} is malformed or not valid. Exiting`)
    } catch (error) {
      this.log.error(error.message)
      return
    }

    if (config.type && !(config.type === 'tv' || config.type === 'speaker' || config.type === 'smartspeaker' || config.type === 'bulb' || config.type === 'fan' || config.type === 'switch')) {
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
          if (!str.isString(exclude)) throw new Error(`Exclude value ${exclude} is invalid. Exiting`)
          if (!this.isApi(exclude)) throw new Error(`Exclusion apiID ${exclude} is invalid. Exiting`)
        })
      } catch (error) {
        this.log.error(error.message)
        return
      }
    }

    if (config.speakergroups) {
      try {
        config.speakergroups.forEach((group) => {
          if (!(Number.isInteger(group.id) || Number.isInteger(parseInt(group.id)))) throw new Error(`SpeakerGroup id ${group.id} is malformed or invalid. Exiting`)
        })
      } catch (error) {
        this.log.error(error.message)
        return
      }
    }

    this.ip = config.ip
    this.type = config.type || 'fan'
    this.mode = config.mode || ((this.type === 'speaker' || config.type === 'smartspeaker') ? 'mute' : 'power')
    this.on = config.on || ((this.type === 'tv') ? 'input' : 'on')
    this.default = config.default || 1
    this.inputs = config.inputs || []
    this.exclude = config.exclude || []
    this.speakergroups = config.speakergroups || []

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
    this.sgroups = {}
    this.jid = ''
    this.parsedInputs = []
    this.devicetype = 'speaker'

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

    this.sgroups.statusUrl = this.baseUrl + '/BeoZone/Zone/Sound/SpeakerGroup'
    this.sgroups.setUrl = this.baseUrl + '/BeoZone/Zone/Sound/SpeakerGroup/Active'

    // prepare accessory services
    if (!this.setupAccessoryServices()) return // setup failed - exit

    setTimeout(function () {
      scope.notificationLoop()
    }, 5000)
  }

  notificationLoop () {
    const scope = this

    this.getPowerState()
    this.createNotificationListener()

    setInterval(function reset () {
      scope.closeNotificationListener()
      scope.getPowerState()
      scope.createNotificationListener()
    }, this.interval)
  }

  closeNotificationListener () {
    if (this.notifyStream) {
      if (this.debug) this.log.debug('Closing notification stream')
      try {
        this.notifyStream.destroy()
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
      this.notifyStream = got.stream(this.notifyUrl, options)
    } catch (error) {
      this.log.error('Error initialising notification stream')
      if (this.debug) this.log.debug(error.message)
    }

    this.notifyStream.on('error', function (error) {
      scope.log.error('Error connecting to the notification stream')
      if (scope.debug) scope.log.debug(error.message)
    })
      .pipe(ndjson.parse())
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
              if (msg.notification.data.primary) {
                scope.updateInput(msg.notification.data.primary)
              } else {
                scope.updateInput('')
              }
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
      .on('error', function (error) {
        scope.log.error('Error during notification JSON streaming')
        if (scope.debug) scope.log.debug(error.message)
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

  async setupAccessoryServices () {
    const result = await this.getDeviceInfo()
    if (!result) {
      this.log.error('Reading device info failed. Have you supplied the correct IP address? Exiting')
      return false
    }

    await this.parseInputs()

    if (!this.speakergroups.length) {
      // if no user supplied speaker groups
      await this.parseSpeakerGroups()
    }

    if (this.type === 'speaker') {
      this.prepareSpeakerService()
    } else if (this.type === 'bulb') {
      this.prepareBulbService()
    } else if (this.type === 'tv') {
      await this.prepareTvService()
    } else if (this.type === 'fan') {
      this.prepareFanService()
    } else if (this.type === 'smartspeaker') {
      this.prepareSmartSpeakerService()
    } else if (this.type === 'switch') {
      this.prepareSwitchService()
    } else {
      this.log.error('Incorrect value for "type" specified. Exiting')
      return false
    }

    await this.getSpeakerGroup()

    // Registers any newly created accessories
    if (this.newDeviceAccessories) this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, this.newDeviceAccessories)

    // Register external devices (e.g. TVs). This will happen each time as they are not cached
    if (this.externalDeviceAccessories) this.api.publishExternalAccessories(PLUGIN_NAME, this.externalDeviceAccessories)

    return true
  }

  async getDeviceInfo () {
    const response = await this._httpRequest(this.deviceUrl, null, 'GET')
    if (!response) {
      // can't parse the device info - fail gracefully
      return false
    } else {
      this.model = response.body.beoDevice.productId.productType
      this.serialNumber = response.body.beoDevice.productId.serialNumber
      this.jid = response.headers['device-jid']
      return true
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
    this.beoplayAccessory.category = Categories.SPEAKER

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
    const configuredInputs = []
    let counter = 1
    const inputsDefined = this.inputs.length > 0

    this.parsedInputs.forEach((input) => {
      const name = input.name
      const type = this.determineInputType(input.type)
      const excluded = this.exclude.includes(input.apiID)
      const visible = inputsDefined ? (this.inputs.filter(data => (data.apiID === input.apiID))).length > 0 : true

      if (excluded && this.debug) this.log.debug('Excluded input: ' + input.name)

      let inputService = this.beoplayAccessory.getService(name.toLowerCase().replace(' ', ''))
      if (!inputService) {
        inputService = this.beoplayAccessory.addService(Service.InputSource, name.toLowerCase().replace(' ', ''), name)
      }

      // if the user hasn't defined an input or has excluded it we will create it as hidden and not configured in case they use it later
      inputService
        .setCharacteristic(Characteristic.Identifier, counter)
        .setCharacteristic(Characteristic.ConfiguredName, name)
        .setCharacteristic(Characteristic.InputSourceType, type)
        .setCharacteristic(Characteristic.IsConfigured, !excluded && visible ? Characteristic.IsConfigured.CONFIGURED : Characteristic.IsConfigured.NOT_CONFIGURED)
        .setCharacteristic(Characteristic.TargetVisibilityState, !excluded && visible ? Characteristic.TargetVisibilityState.SHOWN : Characteristic.TargetVisibilityState.HIDDEN)

      configuredInputs.push(inputService)
      if (this.debug) this.log.debug('Added input ' + counter + ', Name: ' + name + ', Visible: ' + (!excluded && visible))
      counter = counter + 1
    })

    // Add the "None" input if this is a speaker (and not a TV)
    if (this.devicetype === 'speaker') {
      const name = 'None'
      let inputService = this.beoplayAccessory.getService(name.toLowerCase().replace(' ', ''))
      if (!inputService) {
        inputService = this.beoplayAccessory.addService(Service.InputSource, name.toLowerCase().replace(' ', ''), name)
      }

      inputService
        .setCharacteristic(Characteristic.Identifier, counter)
        .setCharacteristic(Characteristic.ConfiguredName, name)
        .setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.OTHER)
        .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
        .setCharacteristic(Characteristic.TargetVisibilityState, Characteristic.TargetVisibilityState.SHOWN)

      configuredInputs.push(inputService)
      if (this.debug) this.log.debug('Added input ' + counter + ', Name: ' + name)

      // add the 'None' input to the list of inputs
      const entry = {
        name: name,
        type: 'OTHER',
        apiID: ''
      }
      this.parsedInputs.push(entry)
    }

    // sense check the default input selected
    if (this.default > counter) {
      this.default = 1
      this.log.warn('Default input out of range. Changed to input ' + this.default)
    }

    configuredInputs.forEach((input) => {
      tvService.addLinkedService(input)
    })
  }

  prepareSwitchService () {
    if (this.debug) this.log.debug('Creating switch')

    this.beoplayAccessory = this.getAccessory('switch')

    let switchService = this.beoplayAccessory.getService(Service.Switch)
    if (!switchService) {
      if (this.debug) this.log.debug('Adding switch service')
      switchService = this.beoplayAccessory.addService(Service.Switch)
    }

    if (this.mode === 'mute') { // we will mute when switch turned off
      switchService
        .getCharacteristic(Characteristic.On)
        .on('set', this.setMuteState.bind(this))
    } else { // we will power on/standby when turned on/off
      switchService
        .getCharacteristic(Characteristic.On)
        .on('set', this.setPowerState.bind(this))
    }

    if (switchService.getCharacteristic(Characteristic.Volume)) {
      switchService
        .getCharacteristic(Characteristic.Volume)
        .on('set', this.setVolume.bind(this))
    } else {
      // add a volume setting to the switch (not supported in the Home app or by Siri)
      switchService
        .addCharacteristic(new Characteristic.Volume())
        .on('set', this.setVolume.bind(this))
    }
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

  async parseInputs () {
    const response = await this._httpRequest(this.sourceUrl, null, 'GET')
    let counter = 1

    if (!response) {
      this.log.error('Reading source input info failed')
    } else {
      response.body.sources.forEach((source) => {
        const entry = {
          name: source[1].friendlyName,
          type: this.mapType(source[1].sourceType.type),
          apiID: source[0]
        }
        this.parsedInputs.push(entry)

        // if this is a TV, ensure that we are using the input method of powering on
        if (source[1].sourceType.type === 'HDMI' || source[1].sourceType.type === 'TV') {
          if (this.devicetype !== 'tv') {
            this.devicetype = 'tv'
            if (this.debug) this.log.debug('[%s] This device has been detected as a TV', this.name)
          }
          if (this.on === 'on') {
            this.log.warn('[%s] TVs cannot power on via the API. Changing to power on via the input method')
            this.on = 'input'
          }
        }
        counter = counter + 1
      })
    }
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
    this.parsedInputs.forEach((input) => {
      if (input.apiID === lookup) {
        match = input.name
      }
    })
    return match
  }

  lookupInputIndex (inputID) {
    const index = this.parsedInputs.findIndex(function (x) {
      return x.apiID === inputID
    })
    return index
  }

  lookupSpeakerGroupName (lookup) {
    let match = ''
    this.speakergroups.forEach((sg) => {
      if (sg.id === lookup) {
        match = sg.name
      }
    })
    return match
  }

  lookupSpeakerGroupIndex (sgid) {
    const index = this.speakergroups.findIndex(function (x) {
      return x.id === sgid
    })
    return index
  }

  async parseSpeakerGroups () {
    const response = await this._httpRequest(this.sgroups.statusUrl, null, 'GET')

    if (!response) {
      this.log.error('parseSpeakerGroups() request failed')
    } else {
      response.body.speakerGroup.list.forEach((sg) => {
        const entry = {
          name: sg.friendlyName,
          id: sg.id
        }
        if (this.debug) this.log.debug('Added SpeakerGroup id: ' + entry.id + ', Name: ' + entry.name)
        this.speakergroups.push(entry)
      })
    }
  }

  async getSpeakerGroup () {
    const response = await this._httpRequest(this.sgroups.statusUrl, null, 'GET')

    if (!response) {
      this.log.error('parseSpeakerGroups() request failed')
    } else {
      if (this.debug) this.log.debug('Current speaker group is ' + response.body.speakerGroup.active + ':' + this.lookupSpeakerGroupName(response.body.speakerGroup.active))
      this.beoplayAccessory.context.currentSpeakerGroup = response.body.speakerGroup.active
    }
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
        callback()
      }
    } else {
      this.log.info('[%s] Mute state set to %s', this.name, muteBody.muted ? 'MUTED' : 'NOT MUTED')
      this.beoplayAccessory.context.currentMuteState = muteBody.muted
      if (callback) {
        callback()
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
      callback()
    } else {
      // If selected, we turn on by setting an input
      if (this.on === 'input' && (power === 1 || power === true)) {
        this.log.info('[%s] Powering on via setting input %d', this.name, this.default)
        this.setInput(this.default, callback)
      } else if (this.on === 'join' && (power === 1 || power === true)) {
        this.log.info('[%s] Powering on via joining experience', this.name)
        this.joinExperience()
        callback()
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
          callback()
        } else {
          this.log.info('[%s] Power state set to %s', this.name, powerBody.standby.powerState)
          this.powerState = powerBody.standby.powerState
          callback()
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
        callback()
      }
    } else {
      this.log.info('[%s] Volume set to %s', this.name, volume)
      this.beoplayAccessory.context.currentVolume = volume
      if (callback) {
        callback()
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
    callback()
  }

  async setTargetMediaState (state, callback) {
    if (this.debug) this.log.debug('[%s] Setting Target Media State to %s', this.name, state)

    if (state === Characteristic.TargetMediaState.PLAY) {
      this.playMedia()
    }

    if (state === Characteristic.TargetMediaState.PAUSE) {
      this.pauseMedia()
    }

    callback()
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

  async setSpeakerGroup (id) {
    if (this.debug) this.log.debug('[%s] Setting Speaker Group to %s', this.name, this.lookupSpeakerGroupName(id))

    if (this.beoplayAccessory.context.currentSpeakerGroup === id) {
      // Already the current Speaker Group - return
    } else {
      const sgBody = {
        active: id
      }

      const response = await this._httpRequest(this.sgroups.setUrl, sgBody, 'PUT')
      if (!response) {
        this.log.error('setSpeakerGroup() request failed')
      } else {
        this.log.info('[%s] Speaker Group set to %s', this.name, this.lookupSpeakerGroupName(id))
        this.beoplayAccessory.context.currentSpeakerGroup = id
      }
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

  nextSpeakerGroup () {
    const current = this.lookupSpeakerGroupIndex(this.beoplayAccessory.context.currentSpeakerGroup)
    if ((current + 1) === this.speakergroups.length) {
      this.setSpeakerGroup(this.speakergroups[0].id)
    } else {
      this.setSpeakerGroup(this.speakergroups[current + 1].id)
    }
  }

  prevSpeakerGroup () {
    const current = this.lookupSpeakerGroupIndex(this.beoplayAccessory.context.currentSpeakerGroup)
    if ((current - 1) <= 0) {
      const last = this.speakergroups.length - 1
      this.setSpeakerGroup(this.speakergroups[last].id)
    } else {
      this.setSpeakerGroup(this.speakergroups[current - 1].id)
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

  async resetInput () {
    const response = await this._httpRequest(this.input.statusUrl, null, 'GET')

    if (!response) {
      this.log('resetInput() request failed')
    } else {
      const input = response.body.activeSources.primary

      if (input) {
        this.log.info('[%s] Active input is %s', this.name, input)
      } else {
        this.log.info('[%s] No active input currently set', this.name)
      }
      this.updateInput(input)
    }
  }

  async setInput (desiredInput, callback) {
    if (this.debug) this.log.debug('[%s] Setting Input to %d', this.name, desiredInput)

    const input = this.parsedInputs[desiredInput - 1]
    if (this.debug) this.log.debug(input)
    if (input.apiID === '') {
      // Can't set to the None input
      this.log.warn('[%s] Cannot set input to None - ignoring', this.name)
      callback()
      this.resetInput()
      return
    }

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
      callback()
    } else {
      this.log.info('[%s] Input set to %s', this.name, input.name)
      this.beoplayAccessory.context.activeInputID = input.apiID
      this.beoplayAccessory.context.activeInput = desiredInput
      callback()
    }
  }

  updateInput (inputID) {
    this.beoplayAccessory.context.activeInputID = inputID
    this.beoplayAccessory.context.activeInput = this.lookupInputIndex(inputID)
    const inputName = this.lookupInputName(inputID)
    this.log.info('[%s] Updating Input to %s', this.name, inputName)

    const inputService = this.beoplayAccessory.getService(inputName.toLowerCase().replace(' ', ''))
    if (inputService.getCharacteristic(Characteristic.TargetVisibilityState).value === Characteristic.TargetVisibilityState.HIDDEN) {
      // user has selected an input that isn't shown in HomeKit, so add it
      this.log.warn('[%s] Enabling disabled Input: %s', this.name, inputName)
      inputService.getCharacteristic(Characteristic.IsConfigured)
        .updateValue(Characteristic.IsConfigured.CONFIGURED)
      inputService.getCharacteristic(Characteristic.TargetVisibilityState)
        .updateValue(Characteristic.TargetVisibilityState.SHOWN)
    }

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
        this.nextSpeakerGroup()
        break
      case Characteristic.RemoteKey.ARROW_DOWN:
        this.prevSpeakerGroup()
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

    callback()
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

export default BeoplayPlatformDevice