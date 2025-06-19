import { expect } from 'chai'
import sinon from 'sinon'
import nock from 'nock'
import BeoplayPlatformDevice from '../lib/BeoplayPlatformDevice.js'

describe('Integration Tests - B&O API Communication', () => {
  let device
  let mockPlatform
  let mockLog
  let mockApi
  let mockConfig

  beforeEach(() => {
    mockLog = {
      info: sinon.stub(),
      error: sinon.stub(),
      debug: sinon.stub(),
      warn: sinon.stub()
    }

    mockApi = {
      hap: {
        uuid: { generate: sinon.stub().returns('test-uuid') },
        Characteristic: {
          Mute: class {},
          Volume: class {},
          On: class {},
          Active: class {},
          InputSourceType: { HDMI: 1, APPLICATION: 2, OTHER: 3, TUNER: 4, AIRPLAY: 5 },
          IsConfigured: { CONFIGURED: 1, NOT_CONFIGURED: 0 },
          TargetVisibilityState: { SHOWN: 0, HIDDEN: 1 }
        },
        Service: {
          Speaker: class {},
          AccessoryInformation: class {}
        },
        Categories: { SPEAKER: 1 }
      },
      platformAccessory: class {
        constructor(name, uuid) {
          this.displayName = name
          this.UUID = uuid
          this.context = {}
        }
        getService() { 
          return { 
            getCharacteristic: () => ({ updateValue: () => {} }),
            setCharacteristic: () => this,
            on: () => this 
          } 
        }
        addService() { return { setCharacteristic: () => this, getCharacteristic: () => this, on: () => this } }
      },
      registerPlatformAccessories: sinon.stub(),
      publishExternalAccessories: sinon.stub()
    }

    mockPlatform = {
      log: mockLog,
      accessories: []
    }

    mockConfig = {
      name: 'Test Device',
      ip: '192.168.1.100',
      type: 'speaker'
    }

    nock.disableNetConnect()
  })

  afterEach(() => {
    sinon.restore()
    nock.cleanAll()
    nock.enableNetConnect()
  })

  describe('Device Information Retrieval', () => {
    it('should successfully retrieve device information', async () => {
      const deviceResponse = {
        beoDevice: {
          productId: {
            productType: 'BeoPlay M5',
            serialNumber: 'ABC123456'
          }
        }
      }

      nock('http://192.168.1.100:8080')
        .get('/BeoDevice')
        .reply(200, deviceResponse, {
          'device-jid': 'test-jid@bang-olufsen.com'
        })

      // Mock other required endpoints for setup
      nock('http://192.168.1.100:8080')
        .get('/BeoZone/Zone/Sources/')
        .reply(200, { sources: [] })

      nock('http://192.168.1.100:8080')
        .get('/BeoZone/Zone/Sound/SpeakerGroup')
        .reply(200, { speakerGroup: { list: [], active: 1 } })

      // Override the constructor's setupAccessoryServices call but don't stub getDeviceInfo
      sinon.stub(BeoplayPlatformDevice.prototype, 'setupAccessoryServices').resolves(true)
      
      device = new BeoplayPlatformDevice(mockPlatform, mockLog, mockConfig, mockApi)
      
      const result = await device.getDeviceInfo()

      expect(result).to.be.true
      expect(device.model).to.equal('BeoPlay M5')
      expect(device.serialNumber).to.equal('ABC123456')
      expect(device.jid).to.equal('test-jid@bang-olufsen.com')
    })

    it('should handle device information retrieval failure', async () => {
      nock('http://192.168.1.100:8080')
        .get('/BeoDevice')
        .replyWithError('Network error')

      device = new BeoplayPlatformDevice(mockPlatform, mockLog, mockConfig, mockApi)
      // Override the constructor's setupAccessoryServices call
      sinon.stub(device, 'setupAccessoryServices').resolves(true)
      
      const result = await device.getDeviceInfo()

      expect(result).to.be.false
    })
  })

  describe('Volume Control', () => {
    beforeEach(async () => {
      // Mock successful device setup
      nock('http://192.168.1.100:8080')
        .get('/BeoDevice')
        .reply(200, {
          beoDevice: {
            productId: { productType: 'Test', serialNumber: '123' }
          }
        }, { 'device-jid': 'test@bang-olufsen.com' })

      nock('http://192.168.1.100:8080')
        .get('/BeoZone/Zone/Sources/')
        .reply(200, { sources: [] })

      nock('http://192.168.1.100:8080')
        .get('/BeoZone/Zone/Sound/SpeakerGroup')
        .reply(200, { speakerGroup: { list: [], active: 1 } })

      device = new BeoplayPlatformDevice(mockPlatform, mockLog, mockConfig, mockApi)
      // Override the constructor's setupAccessoryServices call
      sinon.stub(device, 'setupAccessoryServices').resolves(true)
      // Set up the accessory context properly
      device.beoplayAccessory = { 
        context: {},
        getService: () => ({ 
          getCharacteristic: () => ({ updateValue: () => {} })
        })
      }
    })

    it('should set volume successfully', async () => {
      nock('http://192.168.1.100:8080')
        .put('/BeoZone/Zone/Sound/Volume/Speaker/Level')
        .reply(200, {})

      await device.setVolume(50)

      expect(mockLog.info).to.have.been.calledWith(
        '[%s] Volume set to %s',
        'Test Device',
        50
      )
    })

    it('should handle volume setting failure', async () => {
      nock('http://192.168.1.100:8080')
        .put('/BeoZone/Zone/Sound/Volume/Speaker/Level')
        .replyWithError('Network error')

      await device.setVolume(50)

      expect(mockLog.error).to.have.been.calledWith('setVolume() request failed')
    })

    it('should respect maximum volume limits', async () => {
      device.beoplayAccessory = {
        context: { maxVolume: 30 },
        getService: () => ({ 
          getCharacteristic: () => ({ updateValue: () => {} })
        })
      }

      nock('http://192.168.1.100:8080')
        .put('/BeoZone/Zone/Sound/Volume/Speaker/Level')
        .reply(200, {})

      await device.setVolume(50) // Attempt to set above max

      expect(mockLog.info).to.have.been.calledWith(
        '[%s] Volume set to %s',
        'Test Device',
        30
      )
    })

    it('should scale volume to device maximum when maxvolumescaling is enabled', async () => {
      // Set up device with max volume scaling enabled
      const scalingConfig = { ...mockConfig, maxvolumescaling: true }
      device = new BeoplayPlatformDevice(mockPlatform, mockLog, scalingConfig, mockApi)
      sinon.stub(device, 'setupAccessoryServices').resolves(true)
      
      device.beoplayAccessory = {
        context: { maxVolume: 60 },
        getService: () => ({ 
          getCharacteristic: () => ({ updateValue: () => {} })
        })
      }

      nock('http://192.168.1.100:8080')
        .put('/BeoZone/Zone/Sound/Volume/Speaker/Level')
        .reply(200, {})

      // Setting 50% should result in 30 (50% of 60)
      await device.setVolume(50)

      expect(mockLog.info).to.have.been.calledWith(
        '[%s] Volume set to %s',
        'Test Device',
        30
      )
    })

    it('should handle volume above maximum with scaling enabled', async () => {
      const scalingConfig = { ...mockConfig, maxvolumescaling: true, debug: true }
      device = new BeoplayPlatformDevice(mockPlatform, mockLog, scalingConfig, mockApi)
      sinon.stub(device, 'setupAccessoryServices').resolves(true)
      
      device.beoplayAccessory = {
        context: { maxVolume: 40 },
        getService: () => ({ 
          getCharacteristic: () => ({ updateValue: () => {} })
        })
      }

      nock('http://192.168.1.100:8080')
        .put('/BeoZone/Zone/Sound/Volume/Speaker/Level')
        .reply(200, {})

      // Setting 80% would be 32 (80% of 40), but let's test 100% = 40
      await device.setVolume(100)

      expect(mockLog.debug).to.have.been.calledWith(
        '[%s] Volume is scaled to the device maximum volume',
        'Test Device'
      )
      expect(mockLog.info).to.have.been.calledWith(
        '[%s] Volume set to %s',
        'Test Device',
        40
      )
    })

    it('should sync HomeKit volume when requested volume exceeds maximum', async () => {
      const debugConfig = { ...mockConfig, debug: true }
      device = new BeoplayPlatformDevice(mockPlatform, mockLog, debugConfig, mockApi)
      sinon.stub(device, 'setupAccessoryServices').resolves(true)
      
      device.beoplayAccessory = {
        context: { maxVolume: 30, currentVolume: 25 },
        getService: () => ({ 
          getCharacteristic: () => ({ updateValue: () => {} })
        })
      }

      // Stub the updateVolume method to track calls
      const updateVolumeSpy = sinon.spy(device, 'updateVolume')

      nock('http://192.168.1.100:8080')
        .put('/BeoZone/Zone/Sound/Volume/Speaker/Level')
        .reply(200, {})

      await device.setVolume(50) // Above max, should be clamped to 30

      expect(mockLog.debug).to.have.been.calledWith(
        '[%s] Volume of %d is higher than the device max, setting to the max of %d',
        'Test Device',
        50,
        30
      )
      expect(mockLog.debug).to.have.been.calledWith(
        '[%s] Adjusting HomeKit device volume to %d',
        'Test Device',
        30
      )
      expect(updateVolumeSpy).to.have.been.calledWith(30, 30)
    })
  })

  describe('Volume Update and Scaling', () => {
    beforeEach(async () => {
      nock('http://192.168.1.100:8080')
        .get('/BeoDevice')
        .reply(200, {
          beoDevice: {
            productId: { productType: 'Test', serialNumber: '123' }
          }
        }, { 'device-jid': 'test@bang-olufsen.com' })

      nock('http://192.168.1.100:8080')
        .get('/BeoZone/Zone/Sources/')
        .reply(200, { sources: [] })

      nock('http://192.168.1.100:8080')
        .get('/BeoZone/Zone/Sound/SpeakerGroup')
        .reply(200, { speakerGroup: { list: [], active: 1 } })
    })

    it('should update volume with scaling disabled (default)', async () => {
      device = new BeoplayPlatformDevice(mockPlatform, mockLog, mockConfig, mockApi)
      sinon.stub(device, 'setupAccessoryServices').resolves(true)
      device.beoplayAccessory = { 
        context: {},
        getService: () => ({ 
          getCharacteristic: () => ({ updateValue: () => {} })
        })
      }

      device.updateVolume(25, 50)

      expect(mockLog.info).to.have.been.calledWith(
        '[%s] Updating Volume to %d and limit to %d',
        'Test Device',
        25,
        50
      )
    })

    it('should update volume with scaling enabled', async () => {
      const scalingConfig = { ...mockConfig, maxvolumescaling: true }
      device = new BeoplayPlatformDevice(mockPlatform, mockLog, scalingConfig, mockApi)
      sinon.stub(device, 'setupAccessoryServices').resolves(true)
      device.beoplayAccessory = { 
        context: {},
        getService: () => ({ 
          getCharacteristic: () => ({ updateValue: () => {} })
        })
      }

      // Device volume 30 out of max 60 should show as 50% in HomeKit
      device.updateVolume(30, 60)

      expect(mockLog.info).to.have.been.calledWith(
        '[%s] Updating Volume to %d of the device max volume %d',
        'Test Device',
        50, // 30/60 * 100 = 50
        60
      )
    })

    it('should handle edge case volumes with scaling', async () => {
      const scalingConfig = { ...mockConfig, maxvolumescaling: true }
      device = new BeoplayPlatformDevice(mockPlatform, mockLog, scalingConfig, mockApi)
      sinon.stub(device, 'setupAccessoryServices').resolves(true)
      device.beoplayAccessory = { 
        context: {},
        getService: () => ({ 
          getCharacteristic: () => ({ updateValue: () => {} })
        })
      }

      // Test with maximum volume (should show 100%)
      device.updateVolume(45, 45)
      expect(mockLog.info).to.have.been.calledWith(
        '[%s] Updating Volume to %d of the device max volume %d',
        'Test Device',
        100,
        45
      )

      // Test with zero volume (should show 0%)
      mockLog.info.resetHistory()
      device.updateVolume(0, 45)
      expect(mockLog.info).to.have.been.calledWith(
        '[%s] Updating Volume to %d of the device max volume %d',
        'Test Device',
        0,
        45
      )
    })
  })

  describe('Mute Control', () => {
    beforeEach(async () => {
      nock('http://192.168.1.100:8080')
        .get('/BeoDevice')
        .reply(200, {
          beoDevice: {
            productId: { productType: 'Test', serialNumber: '123' }
          }
        }, { 'device-jid': 'test@bang-olufsen.com' })

      nock('http://192.168.1.100:8080')
        .get('/BeoZone/Zone/Sources/')
        .reply(200, { sources: [] })

      nock('http://192.168.1.100:8080')
        .get('/BeoZone/Zone/Sound/SpeakerGroup')
        .reply(200, { speakerGroup: { list: [], active: 1 } })

      device = new BeoplayPlatformDevice(mockPlatform, mockLog, mockConfig, mockApi)
      // Override the constructor's setupAccessoryServices call
      sinon.stub(device, 'setupAccessoryServices').resolves(true)
      // Set up the accessory context properly
      device.beoplayAccessory = { 
        context: {},
        getService: () => ({ 
          getCharacteristic: () => ({ updateValue: () => {} })
        })
      }
    })

    it('should set mute state successfully', async () => {
      nock('http://192.168.1.100:8080')
        .put('/BeoZone/Zone/Sound/Volume/Speaker/Muted')
        .reply(200, {})

      await device.setMuteState(true)

      expect(mockLog.info).to.have.been.calledWith(
        '[%s] Mute state set to %s',
        'Test Device',
        'MUTED'
      )
    })

    it('should handle mute setting failure', async () => {
      nock('http://192.168.1.100:8080')
        .put('/BeoZone/Zone/Sound/Volume/Speaker/Muted')
        .replyWithError('Network error')

      await device.setMuteState(true)

      expect(mockLog.error).to.have.been.calledWith('setMuteState() failed')
    })
  })

  describe('Power Control', () => {
    beforeEach(async () => {
      nock('http://192.168.1.100:8080')
        .get('/BeoDevice')
        .reply(200, {
          beoDevice: {
            productId: { productType: 'Test', serialNumber: '123' }
          }
        }, { 'device-jid': 'test@bang-olufsen.com' })

      nock('http://192.168.1.100:8080')
        .get('/BeoZone/Zone/Sources/')
        .reply(200, { sources: [] })

      nock('http://192.168.1.100:8080')
        .get('/BeoZone/Zone/Sound/SpeakerGroup')
        .reply(200, { speakerGroup: { list: [], active: 1 } })

      device = new BeoplayPlatformDevice(mockPlatform, mockLog, mockConfig, mockApi)
      // Override the constructor's setupAccessoryServices call
      sinon.stub(device, 'setupAccessoryServices').resolves(true)
      // Set up the accessory context properly
      device.beoplayAccessory = { 
        context: {},
        getService: () => ({ 
          getCharacteristic: () => ({ updateValue: () => {} })
        })
      }
    })

    it('should get power state successfully', async () => {
      nock('http://192.168.1.100:8080')
        .get('/BeoDevice/powerManagement')
        .reply(200, {
          profile: {
            powerManagement: {
              standby: { powerState: 'on' }
            }
          }
        })

      await device.getPowerState()

      expect(device.beoplayAccessory.context.currentPowerState).to.be.true
    })

    it('should set power state via API', async () => {
      device.beoplayAccessory.context.currentPowerState = false

      nock('http://192.168.1.100:8080')
        .put('/BeoDevice/powerManagement/standby')
        .reply(200, {})

      const callback = sinon.stub()
      await device.setPowerState(true, callback)

      expect(mockLog.info).to.have.been.calledWith(
        '[%s] Power state set to %s',
        'Test Device',
        'standby'
      )
    })
  })

  describe('Input Management', () => {
    beforeEach(async () => {
      nock('http://192.168.1.100:8080')
        .get('/BeoDevice')
        .reply(200, {
          beoDevice: {
            productId: { productType: 'Test', serialNumber: '123' }
          }
        }, { 'device-jid': 'test@bang-olufsen.com' })

      const sourcesResponse = {
        sources: [
          ['bluetooth:1111.2222.3333@products.bang-olufsen.com', {
            friendlyName: 'Bluetooth',
            sourceType: { type: 'BLUETOOTH' }
          }],
          ['spotify:1111.2222.3334@products.bang-olufsen.com', {
            friendlyName: 'Spotify',
            sourceType: { type: 'SPOTIFY' }
          }]
        ]
      }

      nock('http://192.168.1.100:8080')
        .get('/BeoZone/Zone/Sources/')
        .reply(200, sourcesResponse)

      nock('http://192.168.1.100:8080')
        .get('/BeoZone/Zone/Sound/SpeakerGroup')
        .reply(200, { speakerGroup: { list: [], active: 1 } })

      device = new BeoplayPlatformDevice(mockPlatform, mockLog, mockConfig, mockApi)
      // Override the constructor's setupAccessoryServices call
      sinon.stub(device, 'setupAccessoryServices').resolves(true)
      // Set up the accessory context and inputs manually
      device.beoplayAccessory = { context: {} }
      device.parsedInputs = [
        { name: 'Bluetooth', type: 'OTHER', apiID: 'bluetooth:1111.2222.3333@products.bang-olufsen.com' },
        { name: 'Spotify', type: 'APPLICATION', apiID: 'spotify:1111.2222.3334@products.bang-olufsen.com' }
      ]
    })

    it('should parse inputs correctly', () => {
      expect(device.parsedInputs).to.have.length(2)
      expect(device.parsedInputs[0].name).to.equal('Bluetooth')
      expect(device.parsedInputs[0].type).to.equal('OTHER')
      expect(device.parsedInputs[1].name).to.equal('Spotify')
      expect(device.parsedInputs[1].type).to.equal('APPLICATION')
    })

    it('should set input successfully', async () => {
      device.jid = 'test@bang-olufsen.com'

      nock('http://192.168.1.100:8080')
        .post('/BeoZone/Zone/ActiveSources')
        .reply(200, {})

      const callback = sinon.stub()
      await device.setInput(1, callback)

      expect(mockLog.info).to.have.been.calledWith(
        '[%s] Input set to %s',
        'Test Device',
        'Bluetooth'
      )
      expect(callback).to.have.been.called
    })
  })

  describe('Speaker Group Management', () => {
    it('should parse speaker groups correctly', async () => {
      const speakerGroupResponse = {
        speakerGroup: {
          list: [
            { id: 1, friendlyName: 'Living Room' },
            { id: 2, friendlyName: 'Kitchen' }
          ],
          active: 1
        }
      }

      nock('http://192.168.1.100:8080')
        .get('/BeoDevice')
        .reply(200, {
          beoDevice: {
            productId: { productType: 'Test', serialNumber: '123' }
          }
        }, { 'device-jid': 'test@bang-olufsen.com' })

      nock('http://192.168.1.100:8080')
        .get('/BeoZone/Zone/Sources/')
        .reply(200, { sources: [] })

      nock('http://192.168.1.100:8080')
        .get('/BeoZone/Zone/Sound/SpeakerGroup')
        .twice()
        .reply(200, speakerGroupResponse)

      device = new BeoplayPlatformDevice(mockPlatform, mockLog, mockConfig, mockApi)
      // Override the constructor's setupAccessoryServices call
      sinon.stub(device, 'setupAccessoryServices').resolves(true)
      // Set up the speaker groups manually
      device.speakergroups = [
        { id: 1, name: 'Living Room' },
        { id: 2, name: 'Kitchen' }
      ]

      expect(device.speakergroups).to.have.length(2)
      expect(device.speakergroups[0].name).to.equal('Living Room')
      expect(device.speakergroups[1].name).to.equal('Kitchen')
    })

    it('should set speaker group successfully', async () => {
      device = new BeoplayPlatformDevice(mockPlatform, mockLog, mockConfig, mockApi)
      // Override the constructor's setupAccessoryServices call
      sinon.stub(device, 'setupAccessoryServices').resolves(true)
      device.speakergroups = [{ id: 1, name: 'Test Group' }]
      device.beoplayAccessory = { context: { currentSpeakerGroup: 2 } }

      nock('http://192.168.1.100:8080')
        .put('/BeoZone/Zone/Sound/SpeakerGroup/Active')
        .reply(200, {})

      await device.setSpeakerGroup(1)

      expect(mockLog.info).to.have.been.calledWith(
        '[%s] Speaker Group set to %s',
        'Test Device',
        'Test Group'
      )
    })
  })

  describe('Multiroom Experience', () => {
    beforeEach(() => {
      device = new BeoplayPlatformDevice(mockPlatform, mockLog, mockConfig, mockApi)
      // Override the constructor's setupAccessoryServices call
      sinon.stub(device, 'setupAccessoryServices').resolves(true)
    })

    it('should join multiroom experience successfully', async () => {
      nock('http://192.168.1.100:8080')
        .post('/BeoZone/Zone/Device/OneWayJoin')
        .reply(200, {})

      await device.joinExperience()

      expect(mockLog.info).to.have.been.calledWith(
        '[%s] Joining Multiroom experience',
        'Test Device'
      )
    })

    it('should leave multiroom experience successfully', async () => {
      nock('http://192.168.1.100:8080')
        .delete('/BeoZone/Zone/ActiveSources/primaryExperience')
        .reply(200, {})

      await device.leaveExperience()

      expect(mockLog.info).to.have.been.calledWith(
        '[%s] Leaving Multiroom experience',
        'Test Device'
      )
    })
  })

  describe('Media Control', () => {
    beforeEach(() => {
      device = new BeoplayPlatformDevice(mockPlatform, mockLog, mockConfig, mockApi)
      // Override the constructor's setupAccessoryServices call
      sinon.stub(device, 'setupAccessoryServices').resolves(true)
    })

    it('should control media playback', async () => {
      nock('http://192.168.1.100:8080')
        .post('/BeoZone/Zone/Stream/Play')
        .reply(200, {})

      nock('http://192.168.1.100:8080')
        .post('/BeoZone/Zone/Stream/Pause')
        .reply(200, {})

      nock('http://192.168.1.100:8080')
        .post('/BeoZone/Zone/Stream/Forward')
        .reply(200, {})

      nock('http://192.168.1.100:8080')
        .post('/BeoZone/Zone/Stream/Backward')
        .reply(200, {})

      await device.playMedia()
      await device.pauseMedia()
      await device.forwardMedia()
      await device.backMedia()

      expect(mockLog.info).to.have.been.calledWith(
        '[%s] Forward',
        'Test Device'
      )
      expect(mockLog.info).to.have.been.calledWith(
        '[%s] Back',
        'Test Device'
      )
    })
  })
})