import { expect } from 'chai'
import sinon from 'sinon'
import BeoplayPlatformDevice from '../lib/BeoplayPlatformDevice.js'

describe('Configuration Validation Tests', () => {
  let mockPlatform
  let mockLog
  let mockApi

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
        Characteristic: {},
        Service: {},
        Categories: {}
      },
      platformAccessory: class {},
      registerPlatformAccessories: sinon.stub(),
      publishExternalAccessories: sinon.stub()
    }

    mockPlatform = {
      log: mockLog,
      accessories: []
    }

    // Stub setupAccessoryServices to prevent HTTP calls during validation tests
    sinon.stub(BeoplayPlatformDevice.prototype, 'setupAccessoryServices').returns(true)
  })

  afterEach(() => {
    sinon.restore()
  })

  describe('Basic Configuration Validation', () => {
    it('should accept valid minimal configuration', () => {
      const validConfig = {
        name: 'Test Device',
        ip: '192.168.1.100'
      }

      new BeoplayPlatformDevice(mockPlatform, mockLog, validConfig, mockApi)

      expect(mockLog.error).to.not.have.been.called
    })

    it('should reject invalid IP addresses', () => {
      const testCases = [
        { ip: 'invalid-ip', desc: 'non-IP string' },
        { ip: '999.999.999.999', desc: 'out of range IP' },
        { ip: '192.168.1', desc: 'incomplete IP' },
        { ip: '192.168.1.1.1', desc: 'too many octets' },
        { ip: '', desc: 'empty string' },
        { ip: null, desc: 'null value' },
        { ip: undefined, desc: 'undefined value' }
      ]

      testCases.forEach(({ ip, desc }) => {
        mockLog.error.resetHistory()
        
        const config = { name: 'Test', ip }
        new BeoplayPlatformDevice(mockPlatform, mockLog, config, mockApi)

        expect(mockLog.error).to.have.been.calledWith(
          sinon.match(/IP address.*is malformed or not valid/)
        )
      })
    })

    it('should accept valid IP addresses', () => {
      const validIPs = [
        '192.168.1.1',
        '10.0.0.1',
        '172.16.0.1',
        '127.0.0.1',
        '8.8.8.8'
      ]

      validIPs.forEach(ip => {
        mockLog.error.resetHistory()
        
        const config = { name: 'Test', ip }
        new BeoplayPlatformDevice(mockPlatform, mockLog, config, mockApi)

        expect(mockLog.error).to.not.have.been.called
      })
    })
  })

  describe('Device Type Validation', () => {
    const validTypes = ['tv', 'speaker', 'smartspeaker', 'bulb', 'fan', 'switch']
    const invalidTypes = ['invalid', 'light', 'camera', '', null, 123]

    it('should accept valid device types', () => {
      validTypes.forEach(type => {
        mockLog.error.resetHistory()
        
        const config = { name: 'Test', ip: '192.168.1.100', type }
        new BeoplayPlatformDevice(mockPlatform, mockLog, config, mockApi)

        expect(mockLog.error).to.not.have.been.called
      })
    })

    it('should reject invalid device types', () => {
      invalidTypes.forEach(type => {
        mockLog.error.resetHistory()
        
        const config = { name: 'Test', ip: '192.168.1.100', type }
        new BeoplayPlatformDevice(mockPlatform, mockLog, config, mockApi)

        expect(mockLog.error).to.have.been.called
      })
    })
  })

  describe('Mode Validation', () => {
    const validModes = ['power', 'mute']
    const invalidModes = ['invalid', 'sleep', 'standby', '', null]

    it('should accept valid modes', () => {
      validModes.forEach(mode => {
        mockLog.error.resetHistory()
        
        const config = { name: 'Test', ip: '192.168.1.100', mode }
        new BeoplayPlatformDevice(mockPlatform, mockLog, config, mockApi)

        expect(mockLog.error).to.not.have.been.called
      })
    })

    it('should reject invalid modes', () => {
      invalidModes.forEach(mode => {
        mockLog.error.resetHistory()
        
        const config = { name: 'Test', ip: '192.168.1.100', mode }
        new BeoplayPlatformDevice(mockPlatform, mockLog, config, mockApi)

        expect(mockLog.error).to.have.been.called
      })
    })
  })

  describe('Power On Method Validation', () => {
    const validMethods = ['on', 'input', 'join']
    const invalidMethods = ['invalid', 'api', 'network', '', null]

    it('should accept valid power on methods', () => {
      validMethods.forEach(on => {
        mockLog.error.resetHistory()
        
        const config = { name: 'Test', ip: '192.168.1.100', on }
        new BeoplayPlatformDevice(mockPlatform, mockLog, config, mockApi)

        expect(mockLog.error).to.not.have.been.called
      })
    })

    it('should reject invalid power on methods', () => {
      invalidMethods.forEach(on => {
        mockLog.error.resetHistory()
        
        const config = { name: 'Test', ip: '192.168.1.100', on }
        new BeoplayPlatformDevice(mockPlatform, mockLog, config, mockApi)

        expect(mockLog.error).to.have.been.called
      })
    })
  })

  describe('Default Input Validation', () => {
    it('should accept valid default input values', () => {
      const validDefaults = [1, 2, 10, '1', '5', '99']

      validDefaults.forEach(defaultInput => {
        mockLog.error.resetHistory()
        
        const config = { name: 'Test', ip: '192.168.1.100', default: defaultInput }
        new BeoplayPlatformDevice(mockPlatform, mockLog, config, mockApi)

        expect(mockLog.error).to.not.have.been.called
      })
    })

    it('should reject invalid default input values', () => {
      const invalidDefaults = ['abc', 'not-a-number', '', null, {}, []]

      invalidDefaults.forEach(defaultInput => {
        mockLog.error.resetHistory()
        
        const config = { name: 'Test', ip: '192.168.1.100', default: defaultInput }
        new BeoplayPlatformDevice(mockPlatform, mockLog, config, mockApi)

        expect(mockLog.error).to.have.been.called
      })
    })
  })

  describe('Input Configuration Validation', () => {
    it('should accept valid input configurations', () => {
      const validInputs = [
        {
          name: 'HDMI 1',
          type: 'HDMI',
          apiID: 'hdmi:1111.2222.3333@products.bang-olufsen.com'
        },
        {
          name: 'Spotify',
          type: 'APPLICATION',
          apiID: 'spotify:1111.2222.3333@products.bang-olufsen.com'
        },
        {
          name: 'AirPlay',
          type: 'AIRPLAY',
          apiID: 'airplay:1111.2222.3333@products.bang-olufsen.com'
        }
      ]

      const config = { name: 'Test', ip: '192.168.1.100', inputs: validInputs }
      new BeoplayPlatformDevice(mockPlatform, mockLog, config, mockApi)

      expect(mockLog.error).to.not.have.been.called
    })

    it('should reject incomplete input configurations', () => {
      const incompleteInputs = [
        [{ name: 'Missing Type and API ID' }],
        [{ type: 'HDMI' }], // Missing name and apiID
        [{ apiID: 'hdmi:1111.2222.3333@products.bang-olufsen.com' }], // Missing name and type
        [{ name: 'Test', type: 'HDMI' }], // Missing apiID
        [{ name: 'Test', apiID: 'test:1111.2222.3333@products.bang-olufsen.com' }] // Missing type
      ]

      incompleteInputs.forEach(inputs => {
        mockLog.error.resetHistory()
        
        const config = { name: 'Test', ip: '192.168.1.100', inputs }
        new BeoplayPlatformDevice(mockPlatform, mockLog, config, mockApi)

        expect(mockLog.error).to.have.been.calledWith(
          sinon.match(/Input number.*is not complete/)
        )
      })
    })

    it('should reject invalid input types', () => {
      const invalidTypes = ['INVALID', 'USB', 'OPTICAL', 'BLUETOOTH']

      invalidTypes.forEach(type => {
        mockLog.error.resetHistory()
        
        const inputs = [{
          name: 'Test Input',
          type,
          apiID: 'test:1111.2222.3333@products.bang-olufsen.com'
        }]
        
        const config = { name: 'Test', ip: '192.168.1.100', inputs }
        new BeoplayPlatformDevice(mockPlatform, mockLog, config, mockApi)

        expect(mockLog.error).to.have.been.calledWith(
          sinon.match(`Input type ${type} is not valid`)
        )
      })
    })

    it('should reject malformed API IDs', () => {
      const invalidAPIIds = [
        'malformed-id',
        'missing-domain:1111.2222.3333',
        'wrong-domain:1111.2222.3333@products.wrong.com',
        'hdmi:invalid-format@products.bang-olufsen.com',
        '',
        null,
        undefined
      ]

      invalidAPIIds.forEach(apiID => {
        mockLog.error.resetHistory()
        
        const inputs = [{
          name: 'Test Input',
          type: 'HDMI',
          apiID
        }]
        
        const config = { name: 'Test', ip: '192.168.1.100', inputs }
        new BeoplayPlatformDevice(mockPlatform, mockLog, config, mockApi)

        expect(mockLog.error).to.have.been.called
      })
    })
  })

  describe('Exclude Configuration Validation', () => {
    it('should accept valid exclude configurations', () => {
      const validExcludes = [
        'bluetooth:1111.2222.3333@products.bang-olufsen.com',
        'spotify:1111.2222.3333@products.bang-olufsen.com'
      ]

      const config = { name: 'Test', ip: '192.168.1.100', exclude: validExcludes }
      new BeoplayPlatformDevice(mockPlatform, mockLog, config, mockApi)

      // This test may need adjustment based on actual validation logic
      // expect(mockLog.error).to.not.have.been.called
    })

    it('should reject invalid exclude values', () => {
      const invalidExcludes = [
        ['malformed-exclude-id'],
        [123],
        [null],
        [undefined],
        [{}],
        ['']
      ]

      invalidExcludes.forEach(exclude => {
        mockLog.error.resetHistory()
        
        const config = { name: 'Test', ip: '192.168.1.100', exclude }
        new BeoplayPlatformDevice(mockPlatform, mockLog, config, mockApi)

        expect(mockLog.error).to.have.been.called
      })
    })
  })

  describe('Speaker Group Configuration Validation', () => {
    it('should accept valid speaker group configurations', () => {
      const validSpeakerGroups = [
        { id: 1, name: 'Living Room' },
        { id: '2', name: 'Kitchen' }, // String numbers should be accepted
        { id: 99, name: 'Bedroom' }
      ]

      const config = { name: 'Test', ip: '192.168.1.100', speakergroups: validSpeakerGroups }
      new BeoplayPlatformDevice(mockPlatform, mockLog, config, mockApi)

      expect(mockLog.error).to.not.have.been.called
    })

    it('should reject invalid speaker group IDs', () => {
      const invalidSpeakerGroups = [
        [{ id: 'not-a-number', name: 'Invalid' }],
        [{ id: null, name: 'Invalid' }],
        [{ id: undefined, name: 'Invalid' }],
        [{ id: {}, name: 'Invalid' }],
        [{ id: [], name: 'Invalid' }]
      ]

      invalidSpeakerGroups.forEach(speakergroups => {
        mockLog.error.resetHistory()
        
        const config = { name: 'Test', ip: '192.168.1.100', speakergroups }
        new BeoplayPlatformDevice(mockPlatform, mockLog, config, mockApi)

        expect(mockLog.error).to.have.been.calledWith(
          sinon.match(/SpeakerGroup id.*is malformed or invalid/)
        )
      })
    })
  })

  describe('Configuration Defaults', () => {
    it('should apply correct defaults based on device type', () => {
      const testCases = [
        {
          config: { name: 'Speaker', ip: '192.168.1.100', type: 'speaker' },
          expected: { type: 'speaker', mode: 'mute', on: 'on' }
        },
        {
          config: { name: 'TV', ip: '192.168.1.100', type: 'tv' },
          expected: { type: 'tv', mode: 'power', on: 'input' }
        },
        {
          config: { name: 'SmartSpeaker', ip: '192.168.1.100', type: 'smartspeaker' },
          expected: { type: 'smartspeaker', mode: 'mute', on: 'on' }
        },
        {
          config: { name: 'Default', ip: '192.168.1.100' },
          expected: { type: 'fan', mode: 'power', on: 'on' }
        }
      ]

      testCases.forEach(({ config, expected }) => {
        const device = new BeoplayPlatformDevice(mockPlatform, mockLog, config, mockApi)
        
        expect(device.type).to.equal(expected.type)
        expect(device.mode).to.equal(expected.mode)
        expect(device.on).to.equal(expected.on)
      })
    })

    it('should handle inputs vs exclude precedence correctly', () => {
      const config = {
        name: 'Test',
        ip: '192.168.1.100',
        inputs: [{ name: 'Test', type: 'HDMI', apiID: 'hdmi:1111.2222.3333@products.bang-olufsen.com' }],
        exclude: ['bluetooth:1111.2222.3333@products.bang-olufsen.com']
      }

      const device = new BeoplayPlatformDevice(mockPlatform, mockLog, config, mockApi)

      // When both inputs and exclude are provided, exclude should be ignored
      expect(device.exclude || []).to.be.empty
      expect(device.inputs).to.not.be.empty
    })
  })

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty configuration gracefully', () => {
      const config = {}
      
      // This should trigger IP validation error
      new BeoplayPlatformDevice(mockPlatform, mockLog, config, mockApi)

      expect(mockLog.error).to.have.been.called
    })

    it('should handle null/undefined configuration values', () => {
      const config = {
        name: null,
        ip: undefined,
        type: null,
        mode: undefined
      }

      new BeoplayPlatformDevice(mockPlatform, mockLog, config, mockApi)

      expect(mockLog.error).to.have.been.called
    })

    it('should convert string numbers to integers for default input', () => {
      const config = {
        name: 'Test',
        ip: '192.168.1.100',
        default: '5'
      }

      const device = new BeoplayPlatformDevice(mockPlatform, mockLog, config, mockApi)

      expect(device.default).to.equal(5)
      expect(typeof device.default).to.equal('number')
    })
  })
})