'use strict'

const isip = require('is-ip')
const got = require('got')
const util = require('util')
const syncrequest = require('sync-request')
const tunnel = require('tunnel')

const {
  PLUGIN_VERSION
} = require('./Constants')

var Characteristic, Service, log, name

function initPlatformAccessory (log, device, api, accessory) {
  var services = []
  initialiseServices(api, log)
  setupVariables(accessory, device)
  parseDeviceInfo(accessory)
  logDebug(accessory.context.type)

  if (accessory.context.type === 'speaker') {
    const service = new Service.Speaker(accessory.context.name)
    services.push(service)
  } else if (accessory.context.type === 'bulb') {
    const service = new Service.Lightbulb(accessory.context.name)
    services.push(service)
  } else if (accessory.context.type === 'fan') {
    const service = new Service.Fan(accessory.context.name)
    services.push(service)
  } else if (accessory.context.type === 'tv') {
    const tvService = new Service.Television(accessory.context.name)
    const tvSpeakerService = new Service.TelevisionSpeaker(accessory.context.name + ' Volume')
    services.push(tvService, tvSpeakerService)

    accessory.context.configuredInputs = createInputs(accessory)
    accessory.context.configuredInputs.forEach((input) => {
      tvService.addLinkedService(input)
      services.push(input)
    })
  } else {
    logError(`Incorrect value for "type" (${accessory.context.type}) specified for device ${accessory.context.name}`)
    return
  }
  services.forEach((service) => {
    accessory.addService(service)
  })
}

function setupPlatformAccessory (log, device, api, accessory) {
  if (accessory.context.ip !== device.ip || accessory.context.name !== device.name || accessory.context.type !== device.type) {
    // initialise all the global variables
    initialiseServices(api, log)
    setupVariables(accessory, device)
    parseDeviceInfo()
  }
  if (accessory.context.type === 'speaker') {
    setupSpeakerService(accessory)
  } else if (accessory.context.type === 'bulb') {
    setupBulbService(accessory)
  } else if (accessory.context.type === 'fan') {
    setupFanService(accessory)
  } else if (accessory.context.type === 'tv') {
    setupTvService(accessory)
    setupTvSpeakerService(accessory)
    setupInputs(accessory)
  } else {
    logError(`Incorrect value for "type" (${accessory.context.type}) specified for device ${accessory.context.name}`)
    return
  }
  setupInformationService(accessory)
}

function initialiseServices (api, logval) {
  Characteristic = api.hap.Characteristic
  Service = api.hap.Service
  log = logval
}

function setupVariables (accessory, config) {
  try {
    if (!isip(config.ip)) throw new Error(`IP address is required for device ${config.name}`)
  } catch (error) {
    logError(error)
    return
  }

  accessory.context.name = config.name || 'B&O Device'
  accessory.context.ip = config.ip
  accessory.context.type = config.type || 'speaker'
  accessory.context.mode = config.mode || ((accessory.context.type === 'tv') ? 'power' : 'mute')
  accessory.context.on = config.on || ((accessory.context.type === 'tv') ? 'input' : 'on')
  accessory.context.defaultinput = config.default || 1
  accessory.context.inputs = config.inputs || []
  accessory.context.exclude = config.exclude || []
  accessory.context.debug = config.debug || false
  accessory.context.debugproxy = config.debugproxy

  if (accessory.context.inputs.length && accessory.context.exclude.length) {
    // user has supplied both an inputs values and an exclude value. Ignore the excludes value
    accessory.context.exclude = []
  }

  accessory.context.volume = {}
  accessory.context.mute = {}
  accessory.context.power = {}
  accessory.context.input = {}

  accessory.context.baseUrl = util.format('http://%s:8080', accessory.context.ip)

  accessory.context.deviceUrl = accessory.context.baseUrl + '/BeoDevice'
  accessory.context.sourceUrl = accessory.context.baseUrl + '/BeoZone/Zone/Sources/'

  accessory.context.volume.statusUrl = accessory.context.baseUrl + '/BeoZone/Zone/Sound/Volume'
  accessory.context.volume.setUrl = accessory.context.baseUrl + '/BeoZone/Zone/Sound/Volume/Speaker/Level'

  accessory.context.mute.statusUrl = accessory.context.volume.statusUrl
  accessory.context.mute.setUrl = accessory.context.baseUrl + '/BeoZone/Zone/Sound/Volume/Speaker/Muted'

  accessory.context.power.statusUrl = accessory.context.baseUrl + '/BeoDevice/powerManagement'
  accessory.context.power.setUrl = accessory.context.baseUrl + '/BeoDevice/powerManagement/standby'

  accessory.context.input.statusUrl = accessory.context.baseUrl + '/BeoZone/Zone/ActiveSources'
  accessory.context.input.setUrl = accessory.context.baseUrl + '/BeoZone/Zone/ActiveSources'
}

function parseDeviceInfo (accessory) {
  // ugly synchronous call to device info. Need to figure out a better way of doing this
  try {
    var res = syncrequest('GET', accessory.context.deviceUrl)
    var response = JSON.parse(res.getBody())
    accessory.context.model = response.beoDevice.productId.productType
    accessory.context.serialNumber = response.beoDevice.productId.serialNumber
    accessory.context.jid = res.headers['device-jid']
  } catch {
    // can't parse the device info - fail gracefully
    log('Reading device info failed. Have you supplied the correct IP address?')
  }

  if (accessory.context.type === 'tv') {
    if (!accessory.context.inputs.length) {
      // if the user hasn't supplied their own inputs
      parseInputs(accessory)
    }
  }
}

function setupInformationService (accessory) {
  log('Creating information service')

  accessory.getService(Service.AccessoryInformation)
    .setCharacteristic(Characteristic.Manufacturer, 'Bang & Olufsen')
    .setCharacteristic(Characteristic.Model, accessory.context.model)
    .setCharacteristic(Characteristic.SerialNumber, accessory.context.serialNumber)
    .setCharacteristic(Characteristic.FirmwareRevision, PLUGIN_VERSION)
}

function setupSpeakerService (accessory) {
  log('Creating speaker')

  if (accessory.context.mode === 'mute') { // we will mute the speaker when muted
    accessory.getService(Service.Speaker)
      .getCharacteristic(Characteristic.Mute)
      .on('get', getMuteState.bind(this))
      .on('set', setMuteState.bind(this))
  } else { // we will put speaker in standby when muted
    accessory.getService(Service.Speaker)
      .getCharacteristic(Characteristic.Mute)
      .on('get', getPowerState.bind(this))
      .on('set', setPowerState.bind(this))
  }

  // add a volume setting to the speaker (not supported in the Home app or by Siri)
  accessory.getService(Service.Speaker)
    .addCharacteristic(new Characteristic.Volume())
    .on('get', getVolume.bind(this))
    .on('set', setVolume.bind(this))
}

function setupBulbService (accessory) {
  log('Creating bulb')

  if (accessory.context.mode === 'mute') { // we will mute the speaker when turned off
    accessory.getService(Service.Lightbulb)
      .getCharacteristic(Characteristic.On)
      .on('get', getMuteState.bind(this))
      .on('set', setMuteState.bind(this))
  } else { // we will put speaker in standby when turned off
    accessory.getService(Service.Lightbulb)
      .getCharacteristic(Characteristic.On)
      .on('get', getPowerState.bind(this))
      .on('set', setPowerState.bind(this))
  }

  // bind brightness setting to volume
  accessory.getService(Service.Lightbulb)
    .getCharacteristic(Characteristic.Brightness)
    .on('get', getVolume.bind(this))
    .on('set', setVolume.bind(this))
}

function setupFanService (accessory) {
  log('Creating fan')

  if (accessory.context.mode === 'mute') { // we will mute the device when turned off
    accessory.getService(Service.Fan)
      .getCharacteristic(Characteristic.On)
      .on('get', getMuteState.bind(this))
      .on('set', setMuteState.bind(this))
  } else { // we will put device in standby when turned off
    accessory.getService(Service.Fan)
      .getCharacteristic(Characteristic.On)
      .on('get', getPowerState.bind(this))
      .on('set', setPowerState.bind(this))
  }

  // bind rotation speed setting to volume
  accessory.getService(Service.Fan)
    .getCharacteristic(Characteristic.RotationSpeed)
    .on('get', getVolume.bind(this))
    .on('set', setVolume.bind(this))
}

async function setupTvService (accessory) {
  logInfo('Creating tv')

  accessory.getService(Service.Television)
    .setCharacteristic(Characteristic.ConfiguredName, accessory.context.name)
    .setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE)

  if (accessory.context.mode === 'mute') { // we will mute the TV instead of turning off
    accessory.getService(Service.Television)
      .getCharacteristic(Characteristic.Active)
      .on('get', getMuteState.bind(this))
      .on('set', setMuteState.bind(this))
  } else { // default for TV - power on/off
    accessory.getService(Service.Television)
      .getCharacteristic(Characteristic.Active)
      .on('get', getPowerState.bind(this))
      .on('set', setPowerState.bind(this))
  }

  accessory.getService(Service.Television)
    .getCharacteristic(Characteristic.ActiveIdentifier)
    .on('get', getInput.bind(this))
    .on('set', setInput.bind(this))

  // Configure Remote Control (not currently implemented)
  accessory.getService(Service.Television)
    .getCharacteristic(Characteristic.RemoteKey)
    .on('set', remoteControl.bind(this))
}

async function setupTvSpeakerService (accessory) {
  // Configuring Volume control
  log('Creating tv speaker')

  accessory.getService(Service.TelevisionSpeaker)
    .setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
    .setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE)

  accessory.getService(Service.TelevisionSpeaker)
    .getCharacteristic(Characteristic.VolumeSelector)
    .on('set', (state, callback) => {
      setVolumeSwitch(state, callback, !state)
    })

  accessory.getService(Service.TelevisionSpeaker)
    .getCharacteristic(Characteristic.Mute)
    .on('get', getMuteState.bind(this))
    .on('set', setMuteState.bind(this))

  accessory.getService(Service.TelevisionSpeaker)
    .addCharacteristic(Characteristic.Volume)
    .on('get', getVolume.bind(this))
    .on('set', setVolume.bind(this))

  accessory.getService(Service.Television).addLinkedService(accessory.getService(Service.TelevisionSpeaker))

  getVolume()
  // global - test for behaviour across devices. May need to store in context
}

function mapType (type) {
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

function parseInputs (accessory) {
  // ugly synchronous call to device info. Need to figure out a better way of doing this
  var response
  var counter = 1

  try {
    response = JSON.parse(syncrequest('GET', accessory.context.sourceUrl).getBody())
  } catch {
    log('Reading source input info failed')
  }

  response.sources.forEach((source) => {
    const entry = {
      name: source[1].friendlyName,
      type: mapType(source[1].sourceType.type),
      apiID: source[1].id
    }
    accessory.context.inputs.push(entry)

    // if this is a TV, ensure that we are using the input method of powering on
    if (source[1].sourceType.type === 'TV' && accessory.context.on === 'on') {
      accessory.context.on = 'input'
    }
    counter = counter + 1
  })
}

function createInputs (accessory) {
  var configuredInputs = []

  accessory.context.inputs.forEach((input) => {
    if (!accessory.context.exclude.includes(input.apiID)) {
      const name = input.name

      configuredInputs.push(createInputSource(name))
      log('Added input: ' + name)
    }
  })

  return configuredInputs
}

function setupInputs (accessory) {
  var counter = 1
  var excluded = []

  accessory.context.inputs.forEach((input) => {
    if (accessory.context.exclude.includes(input.apiID)) {
      // this entry is on the exclude list
      log('Excluded input: ' + input.name)
      excluded.push(input)
    } else {
      const name = input.name
      const type = determineInputType(input.type)

      setupInputSource(accessory, name, counter, type)
      log('Enabled input ' + counter + ', Name: ' + name)
      counter = counter + 1
    }
  })
  // sense check the default input selected before we return
  if (accessory.context.defaultinput > counter) {
    accessory.context.defaultinput = counter - 1
    log('Default input out of range. Changed to input ' + accessory.context.defaultinput)
  }

  // remove excluded inputs from the list of inputs
  excluded.forEach((input) => {
    for (var i = 0; i < accessory.context.inputs.length; i++) {
      if (accessory.context.inputs[i] === input) {
        accessory.context.inputs.splice(i, 1)
      }
    }
  })
}

function createInputSource (name) {
  var input = new Service.InputSource(name.toLowerCase().replace(' ', ''), name)
  return input
}

function setupInputSource (accessory, name, number, type) {
  accessory.getService(name.toLowerCase().replace(' ', ''))
    .setCharacteristic(Characteristic.Identifier, number)
    .setCharacteristic(Characteristic.ConfiguredName, name)
    .setCharacteristic(Characteristic.InputSourceType, type)
    .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
}

function determineInputType (type) {
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

function lookupInput (accessory, lookup) {
  var match = ''
  accessory.context.inputs.forEach((input) => {
    if (input.apiID === lookup) {
      match = input.name
    }
  })
  return match
}

async function getMuteState (callback) {
  const response = await _httpRequest(this.context.mute.statusUrl, null, 'GET')

  if (!response) {
    log('getMuteState() failed')
    callback(new Error('getMuteState() failed'))
  } else {
    const muted = response.body.volume.speaker.muted
    log('Speaker is currently %s', muted ? 'MUTED' : 'NOT MUTED')

    if (this.context.type === 'speaker') {
      // return the mute state correctly
      callback(null, muted)
    } else {
      // return the inverse
      callback(null, !muted)
    }
  }
}

async function setMuteState (muted, callback) {
  var muteBody = {
    muted: muted
  }

  if (this.context.type !== 'speaker') {
    // if not a speaker, we need to invert the state we are setting
    muteBody.muted = !muted
  }

  const response = await _httpRequest(this.context.mute.setUrl, muteBody, 'PUT')

  if (!response) {
    log('setMuteState() failed')
    callback(new Error('setMuteState() failed'))
  } else {
    log('Mute state set to %s', muteBody.muted ? 'MUTED' : 'NOT MUTED')
    callback(undefined, response.body)
  }
}

async function getPowerState (callback) {
  const response = await _httpRequest(this.context.power.statusUrl, null, 'GET')

  if (!response) {
    log('getPowerState() request failed')
    callback(new Error('getMuteState() failed'))
  } else {
    const power = response.body.profile.powerManagement.standby.powerState
    log('Device is currently %s', power)

    var state
    if (power === 'on') {
      state = true
    } else {
      state = false
    }
    this.context.currentPowerState = state

    if (callback) {
      if (this.context.type === 'speaker') {
        // return the power state reversed
        callback(null, !state)
      } else {
        // return correctly
        callback(null, state)
      }
    }
  }
}

async function setPowerState (power, callback) {
  // Check if the device is already on
  await getPowerState()
  if (this.context.currentPowerState && (power === 1 || power === true)) {
    // Device is already on - return
    callback(null)
  } else {
    // If selected, we turn on by setting an input
    if (this.context.on === 'input' && (power === 1 || power === true)) {
      log('Powering on via setting input %d', this.context.defaultinput)
      setInput(this.context.defaultinput, callback)
    } else { // If not use the API
      var powerBody = {
        standby: {
          powerState: power ? 'on' : 'standby'
        }
      }

      if (this.context.type === 'speaker') {
        // if a speaker, we need to invert the state we are setting
        powerBody.standby.powerState = !power ? 'on' : 'standby'
      }

      const response = await _httpRequest(power.setUrl, powerBody, 'PUT')
      if (!response) {
        log('setPowerState() request failed')
        callback(new Error('setPowerState() failed'))
      } else {
        if (this.context.type === 'speaker') {
          log('Power state set to %s', !power ? 'ON' : 'STANDBY')
        } else {
          log('Power state set to %s', power ? 'ON' : 'STANDBY')
        }
        callback(undefined, response.body)
      }
    }
  }
}

async function getVolume (callback) {
  const response = await _httpRequest(this.context.volume.statusUrl, null, 'GET')

  if (!response) {
    log('getVolume() request failed')
    if (callback) {
      callback(new Error('getVolume() failed'))
    }
  } else {
    const volume = parseInt(response.body.volume.speaker.level)
    log('Volume is at %s %', volume)

    this.context.currentVolume = volume
    this.context.maxVolume = parseInt(response.body.volume.speaker.range.maximum)
    log('Maximum volume is set to %s %', this.context.maxVolume)
    if (callback) {
      callback(null, volume)
    }
  }
}

async function setVolume (volume, callback) {
  if (volume > this.context.maxVolume) {
    volume = this.context.maxVolume
  }

  var volumeBody = {
    level: volume
  }

  const response = await _httpRequest(volume.setUrl, volumeBody, 'PUT')

  if (!response) {
    log('setVolume() request failed')
    if (callback) {
      callback(new Error('setVolume() failed'))
    }
  } else {
    log('Volume set to %s', volume)
    this.context.currentVolume = volume
    if (callback) {
      callback(undefined, response.body)
    }
  }
}

async function setVolumeSwitch (state, callback, isUp) {
  log('Volume %s pressed, current volume: %s, limit: %s', isUp ? 'Up' : 'Down', this.context.currentVolume, this.context.maxVolume)
  const volLevel = this.context.currentVolume
  if (isUp) {
    if (volLevel < this.context.maxVolume) {
      setVolume(this.context.currentVolume + 1)
    }
  } else {
    if (volLevel > 0) {
      setVolume(this.context.currentVolume - 1)
    }
  }
  callback(null)
}

async function getInput (callback) {
  const response = await _httpRequest(this.context.input.statusUrl, null, 'GET')

  if (!response) {
    log('getInput() request failed')
    callback(new Error('getInput() failed'))
  } else {
    const input = response.body.activeSources.primary

    if (input) {
      log('Active input is %s', lookupInput(this, input))
    } else {
      log('No active input currently set')
    }

    const index = this.context.inputs.findIndex(function (x) {
      return x.apiID === input
    })
    if (index === -1) { // the current input wasn't found. User hasn't defined?
      callback(null, 1)
    } else {
      callback(null, index + 1)
    }
  }
}

async function setInput (desiredInput, callback) {
  const input = this.context.inputs[desiredInput - 1]

  var inputBody = {
    primaryExperience: {
      source: {
        id: input.apiID,
        friendlyName: '',
        product: {
          jid: this.context.jid,
          friendlyName: ''
        }
      }
    }
  }

  const response = await _httpRequest(input.setUrl, inputBody, 'POST')

  if (!response) {
    logDebug('setInput() request failed')
    callback(new Error('setInput() failed'))
  } else {
    log('Input set to %s', input.name)
    callback(null, input)
  }
}

function remoteControl (action, callback) {
  switch (action) {
    case 0: // Rewind
      logInfo('REW')
      break
    case 1: // Fast Forward
      logInfo('FF')
      break
    case 2: // Next Track
      logInfo('SKIP_NEXT')
      break
    case 3: // Previous Track
      logInfo('SKIP_PREV')
      break
    case 4: // Up Arrow
      logInfo('UP')
      break
    case 5: // Down Arrow
      logInfo('DOWN')
      break
    case 6: // Left Arrow
      logInfo('LEFT')
      break
    case 7: // Right Arrow
      logInfo('RIGHT')
      break
    case 8: // Select
      logInfo('ENTER')
      break
    case 9: // Back
      logInfo('RETURN')
      break
    case 10: // Exit
      logInfo('CANCEL')
      break
    case 11: // Play / Pause
      logInfo('PLAY')
      break
    case 15: // Information
      logInfo('HOME')
      break
  }

  callback(null)
}

async function _httpRequest (url, body, method) {
  var options = {
    method: method,
    responseType: 'json'
  }

  if (this.context.debug) {
    options.agent = {
      http: tunnel.httpOverHttp({
        proxy: {
          host: this.context.debugproxy,
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
    logError('Error on HTTP request')
    logError(error)
    return null
  }
}

function logInfo (message, ...args) {
  log.info((name ? `[${name}] ` : '') + message, ...args)
}

function logDebug (message, ...args) {
  log.debug((name ? `[${name}] ` : '') + message, ...args)
}

function logError (message, ...args) {
  log.error((name ? `[${name}] ` : '') + message, ...args)
}

module.exports = {
  initPlatformAccessory,
  setupPlatformAccessory
}
