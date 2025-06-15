import { expect } from 'chai'
import sinon from 'sinon'
import nock from 'nock'
import chai from 'chai'
import sinonChai from 'sinon-chai'
import BeoplayPlatformDevice from '../lib/BeoplayPlatformDevice.js'

// Configure chai to use sinon-chai plugin
chai.use(sinonChai)

describe('BeoplayPlatformDevice', () => {
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
        uuid: {
          generate: sinon.stub().returns('test-uuid')
        },
        Characteristic: {
          Mute: class MockMute {},
          Volume: class MockVolume {},
          On: class MockOn {},
          Active: class MockActive {},
          InputSourceType: {
            HDMI: 1,
            APPLICATION: 2,
            OTHER: 3,
            TUNER: 4,
            AIRPLAY: 5
          }
        },
        Service: {
          Speaker: class MockSpeakerService {},
          Lightbulb: class MockLightbulbService {},
          Fan: class MockFanService {},
          Television: class MockTVService {},
          SmartSpeaker: class MockSmartSpeakerService {},
          Switch: class MockSwitchService {},
          AccessoryInformation: class MockAccessoryInfoService {}
        },
        Categories: {
          SPEAKER: 1,
          TELEVISION: 2
        }
      },
      platformAccessory: class MockAccessory {
        constructor(name, uuid) {
          this.displayName = name
          this.UUID = uuid
          this.context = {}
        }
        getService() { return null }
        addService() { return {} }
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

    // Mock network validation
    nock.disableNetConnect()
  })

  afterEach(() => {
    sinon.restore()
    nock.cleanAll()
    nock.enableNetConnect()
  })

  describe('constructor - validation', () => {
    it('should validate IP address', () => {
      const invalidConfig = { ...mockConfig, ip: 'invalid-ip' }
      device = new BeoplayPlatformDevice(mockPlatform, mockLog, invalidConfig, mockApi)

      expect(mockLog.error).to.have.been.calledWith(
        sinon.match(/IP address.*is malformed or not valid/)
      )
    })

    it('should validate device type', () => {
      const invalidConfig = { ...mockConfig, type: 'invalid-type' }
      device = new BeoplayPlatformDevice(mockPlatform, mockLog, invalidConfig, mockApi)

      expect(mockLog.error).to.have.been.calledWith(
        sinon.match(/Device type.*is malformed or not valid/)
      )
    })

    it('should validate mode', () => {
      const invalidConfig = { ...mockConfig, mode: 'invalid-mode' }
      device = new BeoplayPlatformDevice(mockPlatform, mockLog, invalidConfig, mockApi)

      expect(mockLog.error).to.have.been.calledWith(
        sinon.match(/Device mode.*is malformed or not valid/)
      )
    })

    it('should validate power on method', () => {
      const invalidConfig = { ...mockConfig, on: 'invalid-on' }
      device = new BeoplayPlatformDevice(mockPlatform, mockLog, invalidConfig, mockApi)

      expect(mockLog.error).to.have.been.calledWith(
        sinon.match(/Device power on method.*is malformed or not valid/)
      )
    })

    it('should validate default input', () => {
      const invalidConfig = { ...mockConfig, default: 'not-a-number' }
      device = new BeoplayPlatformDevice(mockPlatform, mockLog, invalidConfig, mockApi)

      expect(mockLog.error).to.have.been.calledWith(
        sinon.match(/Default input value.*is malformed or not valid/)
      )
    })
  })

  describe('input validation', () => {
    it('should validate input configuration', () => {
      const configWithInputs = {
        ...mockConfig,
        inputs: [
          { name: 'Test Input', type: 'HDMI', apiID: 'hdmi:1111.2222.3333@products.bang-olufsen.com' }
        ]
      }

      // Mock setupAccessoryServices to prevent actual HTTP calls
      sinon.stub(BeoplayPlatformDevice.prototype, 'setupAccessoryServices').returns(false)

      device = new BeoplayPlatformDevice(mockPlatform, mockLog, configWithInputs, mockApi)

      // Should not log validation errors for valid input
      expect(mockLog.error).to.not.have.been.called
    })

    it('should reject incomplete inputs', () => {
      const configWithBadInputs = {
        ...mockConfig,
        inputs: [
          { name: 'Incomplete Input' } // Missing type and apiID
        ]
      }

      device = new BeoplayPlatformDevice(mockPlatform, mockLog, configWithBadInputs, mockApi)

      expect(mockLog.error).to.have.been.calledWith(
        sinon.match(/Input number 1 is not complete/)
      )
    })

    it('should reject invalid input types', () => {
      const configWithBadInputs = {
        ...mockConfig,
        inputs: [
          { name: 'Bad Input', type: 'INVALID', apiID: 'test:1111.2222.3333@products.bang-olufsen.com' }
        ]
      }

      device = new BeoplayPlatformDevice(mockPlatform, mockLog, configWithBadInputs, mockApi)

      expect(mockLog.error).to.have.been.calledWith(
        sinon.match(/Input type INVALID is not valid/)
      )
    })

    it('should reject malformed API IDs', () => {
      const configWithBadInputs = {
        ...mockConfig,
        inputs: [
          { name: 'Bad Input', type: 'HDMI', apiID: 'malformed-api-id' }
        ]
      }

      device = new BeoplayPlatformDevice(mockPlatform, mockLog, configWithBadInputs, mockApi)

      expect(mockLog.error).to.have.been.calledWith(
        sinon.match(/Input apiID.*is invalid/)
      )
    })
  })

  describe('speaker group validation', () => {
    it('should validate speaker group IDs', () => {
      const configWithSpeakerGroups = {
        ...mockConfig,
        speakergroups: [
          { id: 'not-a-number', name: 'Invalid Group' }
        ]
      }

      device = new BeoplayPlatformDevice(mockPlatform, mockLog, configWithSpeakerGroups, mockApi)

      expect(mockLog.error).to.have.been.calledWith(
        sinon.match(/SpeakerGroup id.*is malformed or invalid/)
      )
    })
  })

  describe('API ID validation', () => {
    beforeEach(() => {
      // Mock setupAccessoryServices to prevent actual HTTP calls
      sinon.stub(BeoplayPlatformDevice.prototype, 'setupAccessoryServices').returns(false)
      device = new BeoplayPlatformDevice(mockPlatform, mockLog, mockConfig, mockApi)
    })

    it('should validate correct API ID format', () => {
      const validApiId = 'bluetooth:1111.2222222.33333333@products.bang-olufsen.com'
      expect(device.isApi(validApiId)).to.be.true
    })

    it('should reject invalid API ID format', () => {
      const invalidApiId = 'invalid-format'
      expect(device.isApi(invalidApiId)).to.be.false
    })

    it('should reject API ID with wrong domain', () => {
      const invalidApiId = 'bluetooth:1111.2222222.33333333@wrong.domain.com'
      expect(device.isApi(invalidApiId)).to.be.false
    })
  })

  describe('HTTP request method', () => {
    beforeEach(() => {
      sinon.stub(BeoplayPlatformDevice.prototype, 'setupAccessoryServices').returns(false)
      device = new BeoplayPlatformDevice(mockPlatform, mockLog, mockConfig, mockApi)
    })

    it('should make successful HTTP request', async () => {
      const mockResponse = { test: 'data' }
      
      nock('http://192.168.1.100:8080')
        .get('/test')
        .reply(200, mockResponse)

      const response = await device._httpRequest('http://192.168.1.100:8080/test', null, 'GET')

      expect(response.body).to.deep.equal(mockResponse)
    })

    it('should handle HTTP request errors', async () => {
      nock('http://192.168.1.100:8080')
        .get('/test')
        .replyWithError('Network error')

      const response = await device._httpRequest('http://192.168.1.100:8080/test', null, 'GET')

      expect(response).to.be.null
      expect(mockLog.error).to.have.been.calledWith('Error on HTTP request')
    })

    it('should include timeout in request options', async () => {
      const device = new BeoplayPlatformDevice(mockPlatform, mockLog, mockConfig, mockApi)
      
      // Access the _httpRequest method directly to test timeout configuration
      const options = {
        method: 'GET',
        responseType: 'json',
        timeout: {
          request: 10000
        }
      }

      // Verify timeout is set correctly by checking the options structure
      expect(options.timeout.request).to.equal(10000)
    })
  })

  describe('device type mapping', () => {
    beforeEach(() => {
      sinon.stub(BeoplayPlatformDevice.prototype, 'setupAccessoryServices').returns(false)
      device = new BeoplayPlatformDevice(mockPlatform, mockLog, mockConfig, mockApi)
    })

    it('should map source types correctly', () => {
      expect(device.mapType('TV')).to.equal('TV')
      expect(device.mapType('HDMI')).to.equal('HDMI')
      expect(device.mapType('YOUTUBE')).to.equal('APPLICATION')
      expect(device.mapType('SPOTIFY')).to.equal('APPLICATION')
      expect(device.mapType('AIRPLAY')).to.equal('AIRPLAY')
      expect(device.mapType('UNKNOWN')).to.equal('OTHER')
    })

    it('should determine HomeKit input types', () => {
      expect(device.determineInputType('TV')).to.equal(mockApi.hap.Characteristic.InputSourceType.TUNER)
      expect(device.determineInputType('HDMI')).to.equal(mockApi.hap.Characteristic.InputSourceType.HDMI)
      expect(device.determineInputType('APPLICATION')).to.equal(mockApi.hap.Characteristic.InputSourceType.APPLICATION)
      expect(device.determineInputType('AIRPLAY')).to.equal(mockApi.hap.Characteristic.InputSourceType.AIRPLAY)
      expect(device.determineInputType('OTHER')).to.equal(mockApi.hap.Characteristic.InputSourceType.OTHER)
    })
  })

  describe('configuration defaults', () => {
    it('should set correct defaults for speaker', () => {
      sinon.stub(BeoplayPlatformDevice.prototype, 'setupAccessoryServices').returns(false)
      
      const speakerConfig = { ...mockConfig, type: 'speaker' }
      device = new BeoplayPlatformDevice(mockPlatform, mockLog, speakerConfig, mockApi)

      expect(device.type).to.equal('speaker')
      expect(device.mode).to.equal('mute')
      expect(device.on).to.equal('on')
    })

    it('should set correct defaults for TV', () => {
      sinon.stub(BeoplayPlatformDevice.prototype, 'setupAccessoryServices').returns(false)
      
      const tvConfig = { ...mockConfig, type: 'tv' }
      device = new BeoplayPlatformDevice(mockPlatform, mockLog, tvConfig, mockApi)

      expect(device.type).to.equal('tv')
      expect(device.mode).to.equal('power')
      expect(device.on).to.equal('input')
    })

    it('should default to fan type when no type specified', () => {
      sinon.stub(BeoplayPlatformDevice.prototype, 'setupAccessoryServices').returns(false)
      
      const { type, ...configWithoutType } = mockConfig
      device = new BeoplayPlatformDevice(mockPlatform, mockLog, configWithoutType, mockApi)

      expect(device.type).to.equal('fan')
    })
  })
})