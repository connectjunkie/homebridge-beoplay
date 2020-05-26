"use strict";

var Service, Characteristic;
const got = require("got");
const util = require("util");
const syncrequest = require('sync-request');
const tunnel = require('tunnel');
const isip = require('is-ip');

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory("homebridge-beoplay", "Beoplay", BeoplayAccessory);
};

function BeoplayAccessory(log, config) {
    this.log = log;
    this.services = [];

    this.name = config.name || "B&O Speaker";

    if (!isip(config.ip)) {
        this.log('Invalid IP address supplied');
        return;
    }
    this.ip = config.ip;
    this.type = config.type || 'speaker';
    this.mode = config.mode || 'mute';
    this.on = config.on || ((this.type == 'tv') ? 'input' : 'on');
    this.default = config.default || 1;
    this.inputs = config.inputs || [];
    this.debug = config.debug || false;

    // Default to the Max volume in case this is not obtained before the volume is set the first time
    this.maxVolume = 90;
    this.inputList = [];
    this.inputDetails = {};
    this.volume = {};
    this.mute = {};
    this.power = {};
    this.input = {};
    this.jid = '';
    this.currentInput = '';

    this.baseUrl = util.format('http://%s:8080', this.ip);

    this.deviceUrl = this.baseUrl + '/BeoDevice';

    this.volume.statusUrl = this.baseUrl + '/BeoZone/Zone/Sound/Volume';
    this.volume.setUrl = this.baseUrl + '/BeoZone/Zone/Sound/Volume/Speaker/Level';

    this.mute.statusUrl = this.volume.statusUrl;
    this.mute.setUrl = this.baseUrl + '/BeoZone/Zone/Sound/Volume/Speaker/Muted';

    this.power.statusUrl = this.baseUrl + '/BeoDevice/powerManagement';
    this.power.setUrl = this.baseUrl + '/BeoDevice/powerManagement/standby';

    this.input.statusUrl = this.baseUrl + '/BeoZone/Zone/ActiveSources';
    this.input.setUrl = this.baseUrl + '/BeoZone/Zone/ActiveSources';
}

BeoplayAccessory.prototype = {

    identify: function (callback) {
        this.log("Identify requested!");
        callback();
    },

    getServices: function () {
        if (!this.ip) {
            // IP address wasn't supplied or is incorrect - fail gracefully
            return;
        }
        
        // ugly synchronous call to device info. Need to figure out a better way of doing this
        try {
            var response = JSON.parse(syncrequest('GET', this.deviceUrl).getBody());
            this.model = response.beoDevice.productId.productType;
            this.serialNumber = response.beoDevice.productId.serialNumber;
        } catch {
            this.log("Reading device info failed");
        }

        if (this.type == 'speaker') {
            this.prepareSpeakerService();
        } else if (this.type == 'bulb') {
            this.prepareBulbService();
        } else if (this.type == 'tv') {
            this.prepareTvService();
        } else {
            this.log("Incorrect value for 'type' specified");
            return;
        }

        this.prepareInformationService();

        return this.services;
    },

    prepareInformationService: function () {
        var informationService = new Service.AccessoryInformation();

        informationService
            .setCharacteristic(Characteristic.Manufacturer, "Bang & Olufsen")
            .setCharacteristic(Characteristic.Model, this.model)
            .setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
            .setCharacteristic(Characteristic.FirmwareRevision, "0.2.0");

        this.services.push(informationService);
    },

    prepareSpeakerService: function () {
        this.log("Creating speaker");
        let speakerService = new Service.Speaker(this.name);

        if (this.mode == 'mute') { // we will mute the speaker when muted
            speakerService
                .getCharacteristic(Characteristic.Mute)
                .on("get", this.getMuteState.bind(this))
                .on("set", this.setMuteState.bind(this));
        } else { // we will put speaker in standby when muted
            speakerService
                .getCharacteristic(Characteristic.Mute)
                .on("get", this.getPowerState.bind(this))
                .on("set", this.setPowerState.bind(this));
        }

        // add a volume setting to the speaker (not supported in the Home app or by Siri)
        speakerService
            .addCharacteristic(new Characteristic.Volume())
            .on("get", this.getVolume.bind(this))
            .on("set", this.setVolume.bind(this));

        this.services.push(speakerService);
    },

    prepareBulbService: function () {
        this.log("Creating bulb");
        let bulbService = new Service.Lightbulb(this.name);

        if (this.mode == 'mute') { // we will mute the speaker when turned off
            bulbService
                .getCharacteristic(Characteristic.On)
                .on("get", this.getMuteState.bind(this))
                .on("set", this.setMuteState.bind(this));
        } else { // we will put speaker in standby when turned off
            bulbService
                .getCharacteristic(Characteristic.On)
                .on("get", this.getPowerState.bind(this))
                .on("set", this.setPowerState.bind(this));
        }

        // bind brightness setting to volume
        bulbService
            .addCharacteristic(new Characteristic.Brightness())
            .on("get", this.getVolume.bind(this))
            .on("set", this.setVolume.bind(this));

        this.services.push(bulbService);
    },

    prepareTvService: function () {
        this.log("Creating tv");

        // Configure TV Accessory
        let tvService = new Service.Television(this.name, "tvService");

        tvService
            .setCharacteristic(Characteristic.ConfiguredName, this.name)
            .setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

        tvService
            .getCharacteristic(Characteristic.Active)
            .on("get", this.getPowerState.bind(this))
            .on("set", this.setPowerState.bind(this));

        tvService
            .getCharacteristic(Characteristic.ActiveIdentifier)
            .on("get", this.getInput.bind(this))
            .on("set", this.setInput.bind(this));

        //Configure Remote Control (not currently implemented)
        tvService
            .getCharacteristic(Characteristic.RemoteKey)
            .on("set", this.remoteControl.bind(this));

        // Configuring Volume control
        this.log("Creating tv speaker");

        let tvSpeakerService = new Service.TelevisionSpeaker(this.name + " Volume", "volumeService");

        tvSpeakerService
            .setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
            .setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);

        tvSpeakerService
            .getCharacteristic(Characteristic.VolumeSelector)
            .on("set", (newValue, callback) => {
                this.tv.setVolume(newValue);
                callback(null, newValue);
            });

        tvSpeakerService
            .getCharacteristic(Characteristic.Mute)
            .on("get", this.getMuteState.bind(this))
            .on("set", this.setMuteState.bind(this));

        tvSpeakerService
            .getCharacteristic(Characteristic.Volume)
            .on("get", this.getVolume.bind(this))
            .on("set", this.setVolume.bind(this));

        tvService.addLinkedService(tvSpeakerService);
        this.services.push(tvSpeakerService);

        // Configure TV inputs
        let configuredInputs = this.setupInputs();
        configuredInputs.forEach((input) => {
            tvService.addLinkedService(input);
            this.services.push(input);
        });

        this.services.push(tvService);
    },

    setupInputs: function () {
        var configuredInputs = [];
        var counter = 1;

        this.inputs.forEach((input) => {
            let name = input.name;
            let type = this.determineInputType(input.type);
            this.log("Adding input " + counter + ": Name: " + name + ", Type: " + input.type);

            configuredInputs.push(this.createInputSource(name, counter, type));
            counter = counter + 1;
        });
        return configuredInputs;
    },

    createInputSource: function (name, number, type) {
        var input = new Service.InputSource(name.toLowerCase().replace(" ", ""), name);
        input
            .setCharacteristic(Characteristic.Identifier, number)
            .setCharacteristic(Characteristic.ConfiguredName, name)
            .setCharacteristic(Characteristic.InputSourceType, type)
            .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED);

        return input;
    },

    determineInputType: function (type) {
        switch (type) {
            case "TV":
                return Characteristic.InputSourceType.TUNER;
            case "HDMI":
                return Characteristic.InputSourceType.HDMI;
            case "APPLICATION":
                return Characteristic.InputSourceType.APPLICATION;
            case "AIRPLAY":
                return Characteristic.InputSourceType.AIRPLAY;
            default:
                return Characteristic.InputSourceType.OTHER;
        }
    },

    //   parseInputs: async function (callback) {
    //       const response = await this._httpRequest(this.input.statusUrl, null, "GET");
    //
    //        if (!response) {
    //            this.log("getInput() request failed");
    //            callback(new Error("getInput() failed"));
    //        } else {
    //            this.inputList = response.body.primaryExperience.source._capabilities.value.id;
    //            this.log(this.inputList);
    //
    //            this.jid = response.headers['device-jid'];
    //            this.log(this.jid);
    //
    //            this.currentInput = response.body.activeSources.primary;
    //            this.log("Current selected input is %s", this.currentInput);
    //            callback(null, this.currentInput);
    //        }
    //    },

    getMuteState: async function (callback) {
        const response = await this._httpRequest(this.mute.statusUrl, null, "GET");

        if (!response) {
            this.log("getMuteState() failed");
            callback(new Error("getMuteState() failed"));
        } else {
            const muted = response.body.volume.speaker.muted;
            this.log("Speaker is currently %s", muted ? "MUTED" : "NOT MUTED");

            if (this.type == 'speaker') {
                // return the mute state correctly
                callback(null, muted);
            } else {
                // return the inverse
                callback(null, !muted);
            }
        }
    },

    setMuteState: async function (muted, callback) {
        var muteBody = {
            muted: muted
        };

        if (this.type !== 'speaker') {
            // if not a speaker, we need to invert the state we are setting
            muteBody.muted = !muted;
        }

        const response = await this._httpRequest(this.mute.setUrl, muteBody, "PUT");

        if (!response) {
            this.log("setMuteState() failed");
            callback(new Error("setMuteState() failed"));
        } else {
            this.log("Mute state set to %s", muted ? "ON" : "OFF");
            callback(undefined, response.body);
        }
    },

    getPowerState: async function (callback) {
        const response = await this._httpRequest(this.power.statusUrl, null, "GET");

        if (!response) {
            this.log("getPowerState() request failed");
            callback(new Error("getMuteState() failed"));
        } else {
            const power = response.body.profile.powerManagement.standby.powerState;
            this.log("Speaker is currently %s", power);

            var state;
            if (power == "on") {
                state = true;
            } else {
                state = false;
            }

            if (this.type == 'speaker') {
                // return the power state reversed
                callback(null, !state);
            } else {
                // return correctly
                callback(null, state);
            }
        }
    },

    setPowerState: async function (power, callback) {
        // If this is a TV and we're turning it on, we turn on by setting an input
        if (this.on == 'input') {
            this.setInput(this.default, callback);
        } else { // If not use the API
            var powerBody = {
                standby: {
                    powerState: power ? "on" : "standby"
                }
            };

            if (this.type == 'speaker') {
                // if a speaker, we need to invert the state we are setting
                powerBody.standby.powerState = !power ? "on" : "standby";
            }

            const response = await this._httpRequest(this.power.setUrl, powerBody, "PUT");
            if (!response) {
                this.log("setPowerState() request failed");
                callback(new Error("setPowerState() failed"));
            } else {
                if (this.type == 'speaker') {
                    this.log("Power state set to %s", !power ? "ON" : "STANDBY");
                } else {
                    this.log("Power state set to %s", power ? "ON" : "STANDBY");
                }
                callback(undefined, response.body);
            }
        }
    },

    getVolume: async function (callback) {
        const response = await this._httpRequest(this.volume.statusUrl, null, "GET");

        if (!response) {
            this.log("getVolume() request failed");
            callback(new Error("getVolume() failed"));
        } else {
            const volume = parseInt(response.body.volume.speaker.level);
            this.log("Volume is at %s %", volume);

            this.maxVolume = parseInt(response.body.volume.speaker.range.maximum);
            this.log("Maximum volume is set to %s %", this.maxVolume);
            callback(null, volume);
        }
    },

    setVolume: async function (volume, callback) {
        if (volume > this.maxVolume) {
            volume = this.maxVolume;
        }

        var volumeBody = {
            level: volume
        };

        const response = await this._httpRequest(this.volume.setUrl, volumeBody, "PUT");

        if (!response) {
            this.log("setVolume() request failed");
            callback(new Error("setVolume() failed"));
        } else {
            this.log("Volume set to %s", volume);
            callback(undefined, response.body);
        }
    },

    getInput: async function (callback) {
        const response = await this._httpRequest(this.input.statusUrl, null, "GET");

        if (!response) {
            this.log("getInput() request failed");
            callback(new Error("getInput() failed"));
        } else {
            const input = response.body.activeSources.primary;

            if (input) {
                this.log("Active input is %s", input);
            } else {
                this.log("No active input currently set");
            }

            let index = this.inputs.findIndex(function (x) {
                return x.apiID == input
            });
            callback(null, index + 1);
        }
    },

    setInput: async function (desiredInput, callback) {
        let input = this.inputs[desiredInput - 1];

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
        };

        const response = await this._httpRequest(this.input.setUrl, inputBody, "POST");

        if (!response) {
            this.log("setInput() request failed");
            callback(new Error("setInput() failed"));
        } else {
            this.log("Input set to %s", input.name);
            callback(null, input);
        }
    },

    remoteControl: function (muted, callback) {
        this.log("Remote Control Action: " + action);
        callback(null, action);
    },

    _httpRequest: async function (url, body, method) {
        var options = {
            method: method,
            responseType: 'json'
        }

        if (this.debug) {
            options.agent = {
                http: tunnel.httpOverHttp({
                    proxy: {
                        host: 'localhost',
                        port: 8080
                    }
                })
            }
        }

        if (body !== null) {
            options.json = body;
        }

        try {
            const response = await got(url, options);
            return response;
        } catch (error) {
            this.log("Error on HTTP request");
            this.log(error);
            return null;
        }
    }
};