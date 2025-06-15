import { expect } from 'chai'
import sinon from 'sinon'
import chai from 'chai'
import sinonChai from 'sinon-chai'

import BeoplayPlatform from '../lib/BeoplayPlatform.js'
import { PLUGIN_NAME, PLATFORM_NAME } from '../lib/Constants.js'

// Configure chai to use sinon-chai plugin
chai.use(sinonChai)

describe('BeoplayPlatform', () => {
  let platform
  let mockLog
  let mockApi
  let mockConfig

  beforeEach(() => {
    mockLog = {
      info: sinon.stub(),
      error: sinon.stub(),
      debug: sinon.stub()
    }

    mockApi = {
      hap: {
        uuid: {
          generate: sinon.stub().returns('test-uuid')
        }
      },
      on: sinon.stub(),
      unregisterPlatformAccessories: sinon.stub()
    }

    mockConfig = {
      devices: [
        {
          name: 'Test Speaker',
          ip: '192.168.1.100',
          type: 'speaker',
          debug: true
        },
        {
          name: 'Test TV',
          ip: '192.168.1.101',
          type: 'tv'
        }
      ]
    }
  })

  afterEach(() => {
    sinon.restore()
  })

  describe('constructor', () => {
    it('should initialize with valid config', () => {
      platform = new BeoplayPlatform(mockLog, mockConfig, mockApi)

      expect(platform.log).to.equal(mockLog)
      expect(platform.config).to.equal(mockConfig)
      expect(platform.api).to.equal(mockApi)
      expect(platform.beoplaydevices).to.be.an('array').that.is.empty
      expect(platform.accessories).to.be.an('array').that.is.empty
      expect(platform.deviceids).to.be.an('array').that.is.empty
    })

    it('should return early if no config provided', () => {
      platform = new BeoplayPlatform(mockLog, null, mockApi)

      expect(platform.log).to.be.undefined
      expect(platform.config).to.be.undefined
      expect(platform.api).to.be.undefined
    })

    it('should register for didFinishLaunching event', () => {
      platform = new BeoplayPlatform(mockLog, mockConfig, mockApi)

      expect(mockApi.on).to.have.been.calledWith('didFinishLaunching')
    })
  })

  describe('initDevices', () => {
    beforeEach(() => {
      platform = new BeoplayPlatform(mockLog, mockConfig, mockApi)
    })

    it('should initialize devices from config array', () => {
      // Use a spy instead of stub to track actual method calls
      const initDevicesSpy = sinon.spy(platform, 'initDevices')
      
      platform.initDevices()

      expect(initDevicesSpy).to.have.been.called
      expect(mockLog.info).to.have.been.calledWith(sinon.match(/Initialising/))
    })

    it('should handle invalid devices config type', () => {
      platform.config.devices = 'invalid'
      platform.initDevices()

      expect(mockLog.error).to.have.been.calledWith(
        sinon.match(/devices configuration is not properly formatted/)
      )
    })

    it('should handle missing devices config', () => {
      platform.config.devices = undefined
      platform.initDevices()

      expect(mockLog.error).to.have.been.calledWith(
        'No configured devices found in the config.json file'
      )
    })

    it('should remove unused accessories', () => {
      platform.accessories = [
        { UUID: 'old-uuid', displayName: 'Old Device' }
      ]
      platform.deviceids = ['new-uuid']

      const removeAccessorySpy = sinon.spy(platform, 'removeAccessory')
      platform.initDevices()

      expect(removeAccessorySpy).to.have.been.calledOnce
    })
  })

  describe('configureAccessory', () => {
    beforeEach(() => {
      platform = new BeoplayPlatform(mockLog, mockConfig, mockApi)
    })

    it('should add accessory to accessories array', () => {
      const mockAccessory = {
        displayName: 'Test Accessory',
        UUID: 'test-uuid'
      }

      platform.configureAccessory(mockAccessory)

      expect(platform.accessories).to.include(mockAccessory)
      expect(mockLog.info).to.have.been.calledWith(
        'Loading cached accessory %s with UUID %s',
        'Test Accessory',
        'test-uuid'
      )
    })
  })

  describe('removeAccessory', () => {
    beforeEach(() => {
      platform = new BeoplayPlatform(mockLog, mockConfig, mockApi)
    })

    it('should unregister accessory and log removal', () => {
      const mockAccessory = {
        displayName: 'Test Accessory',
        UUID: 'test-uuid'
      }

      platform.removeAccessory(mockAccessory)

      expect(mockApi.unregisterPlatformAccessories).to.have.been.calledWith(
        PLUGIN_NAME,
        PLATFORM_NAME,
        [mockAccessory]
      )
      expect(mockLog.info).to.have.been.calledWith(
        'Removing accessory %s with UUID %s',
        'Test Accessory',
        'test-uuid'
      )
    })
  })
})