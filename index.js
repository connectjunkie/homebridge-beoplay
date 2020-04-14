"use strict";

var Service, Characteristic;
const request = require("request");
const util = require("util");

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory("homebridge-beoplay", "Beoplay", BeoplayAccessory);
};

function BeoplayAccessory(log, config) {
    this.log = log;

    this.name = config.name;
    this.ip = config.ip;
    this.type = config.type || 'speaker';
    this.mode = config.mode || 'mute';

    // Default to the Max volume of a Beoplay speaker in case this is not obtained before the volume is set the first time
    this.maxVolume = 90;
    this.volume = {};
    this.mute = {};
    this.power = {};

    this.volume.statusUrl = util.format('http://%s:8080/BeoZone/Zone/Sound/Volume', this.ip);
    this.volume.setUrl = util.format('http://%s:8080/BeoZone/Zone/Sound/Volume/Speaker/Level', this.ip);

    this.mute.statusUrl = this.volume.statusUrl;
    this.mute.setUrl = util.format('http://%s:8080/BeoZone/Zone/Sound/Volume/Speaker/Muted', this.ip);

    this.power.statusUrl = util.format('http://%s:8080/BeoDevice/powerManagement/', this.ip);
    this.power.setUrl = util.format('http://%s:8080/BeoDevice/powerManagement/standby', this.ip);
}

BeoplayAccessory.prototype = {

    identify: function (callback) {
        this.log("Identify requested!");
        callback();
    },

    getServices: function () {
        var beoplayService;

        if (this.type == 'speaker') {
            this.log("Creating speaker!");
            beoplayService = new Service.Speaker(this.name);

            if (this.mode == 'mute') { // we will mute the speaker when muted
                this.log("... configuring mute characteristic");
                beoplayService
                    .getCharacteristic(Characteristic.Mute)
                    .on("get", this.getMuteState.bind(this))
                    .on("set", this.setMuteState.bind(this));
            } else { // we will put speaker in standby when muted
                this.log("... configuring power characteristic");
                beoplayService
                    .getCharacteristic(Characteristic.Mute)
                    .on("get", this.getPowerState.bind(this))
                    .on("set", this.setPowerState.bind(this));
            }

            this.log("... adding volume characteristic");
            beoplayService
                .addCharacteristic(new Characteristic.Volume())
                .on("get", this.getVolume.bind(this))
                .on("set", this.setVolume.bind(this));
        } else {
            this.log("Creating bulb!");
            beoplayService = new Service.Lightbulb(this.name);

            if (this.mode == 'mute') { // we will mute the speaker when turned off
                this.log("... configuring on/off characteristic");
                beoplayService
                    .getCharacteristic(Characteristic.On)
                    .on("get", this.getMuteState.bind(this))
                    .on("set", this.setMuteState.bind(this));
            } else { // we will put speaker in standby when turned off
                this.log("... configuring on/off characteristic");
                beoplayService
                    .getCharacteristic(Characteristic.On)
                    .on("get", this.getPowerState.bind(this))
                    .on("set", this.setPowerState.bind(this));
            }

            this.log("... adding volume (brightness) characteristic");
            beoplayService
                .addCharacteristic(new Characteristic.Brightness())
                .on("get", this.getVolume.bind(this))
                .on("set", this.setVolume.bind(this));
        }

        const informationService = new Service.AccessoryInformation();

        informationService
            .setCharacteristic(Characteristic.Manufacturer, "connectjunkie")
            .setCharacteristic(Characteristic.Model, "Beoplay")
            .setCharacteristic(Characteristic.SerialNumber, "A9 Mk2")
            .setCharacteristic(Characteristic.FirmwareRevision, "0.1.3");

        return [informationService, beoplayService];
    },

    getMuteState: function (callback) {
        this._httpRequest(this.mute.statusUrl, null, "GET", function (error, response, body) {
            if (error) {
                this.log("getMuteState() failed: %s", error.message);
                callback(error);
            } else if (response.statusCode !== 200) {
                this.log("getMuteState() request returned http error: %s", response.statusCode);
                callback(new Error("getMuteState() returned http error " + response.statusCode));
            } else {
                const muted = body.volume.speaker.muted;
                this.log("Speaker is currently %s", muted ? "MUTED" : "NOT MUTED");

                if (this.type == 'speaker') {
                    // return the mute state correctly
                    callback(null, muted);
                } else {
                    // return the inverse
                    callback(null, !muted);
                }

            }
        }.bind(this));
    },

    setMuteState: function (muted, callback) {
        var muteBody = {
            muted: muted
        };

        if (this.type !== 'speaker') {
            // if not a speaker, we need to invert the state we are setting
            muteBody.muted = !muted;
        }

        this._httpRequest(this.mute.setUrl, muteBody, "PUT", function (error, response, body) {
            if (error) {
                this.log("setMuteState() failed: %s", error.message);
                callback(error);
            } else if (response.statusCode !== 200) {
                this.log("setMuteState() request returned http error: %s", response.statusCode);
                callback(new Error("setMuteState() returned http error " + response.statusCode));
            } else {
                this.log("setMuteState() successfully set mute state to %s", muted ? "ON" : "OFF");

                callback(undefined, body);
            }
        }.bind(this));
    },

    getPowerState: function (callback) {
        this._httpRequest(this.power.statusUrl, null, "GET", function (error, response, body) {
            if (error) {
                this.log("getPowerState() failed: %s", error.message);
                callback(error);
            } else if (response.statusCode !== 200) {
                this.log("getPowerState() request returned http error: %s", response.statusCode);
                callback(new Error("getMuteState() returned http error " + response.statusCode));
            } else {
                const power = body.profile.powerManagement.standby.powerState;
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
        }.bind(this));
    },

    setPowerState: function (power, callback) {
        var powerBody = {
            standby: {
                powerState: power ? "on" : "standby"
            }
        };

        if (this.type == 'speaker') {
            // if a speaker, we need to invert the state we are setting
            powerBody.standby.powerState = !power ? "on" : "standby";
        }

        this._httpRequest(this.power.setUrl, powerBody, "PUT", function (error, response, body) {
            if (error) {
                this.log("setPowerState() failed: %s", error.message);
                callback(error);
            } else if (response.statusCode !== 200) {
                this.log("setPowerState() request returned http error: %s", response.statusCode);
                callback(new Error("setPowerState() returned http error " + response.statusCode));
            } else {
                if (this.type == 'speaker') {
                    this.log("setPowerState() successfully set power state to %s", !power ? "ON" : "STANDBY");
                } else {
                    this.log("setPowerState() successfully set power state to %s", power ? "ON" : "STANDBY");
                }
                callback(undefined, body);
            }
        }.bind(this));
    },

    getVolume: function (callback) {
        this._httpRequest(this.volume.statusUrl, null, "GET", function (error, response, body) {
            if (error) {
                this.log("getVolume() failed: %s", error.message);
                callback(error);
            } else if (response.statusCode !== 200) {
                this.log("getVolume() request returned http error: %s", response.statusCode);
                callback(new Error("getVolume() returned http error " + response.statusCode));
            } else {
                const volume = parseInt(body.volume.speaker.level);
                this.log("Speaker's volume is at %s %", volume);

                this.maxVolume = parseInt(body.volume.speaker.range.maximum);
                this.log("Speaker's maximum volume is set to %s %", this.maxVolume);

                callback(null, volume);
            }
        }.bind(this));
    },

    setVolume: function (volume, callback) {
        if (volume > this.maxVolume) {
            volume = this.maxVolume;
        }

        var volumeBody = {
            level: volume
        };

        this._httpRequest(this.volume.setUrl, volumeBody, "PUT", function (error, response, body) {
            if (error) {
                this.log("setVolume() failed: %s", error.message);
                callback(error);
            } else if (response.statusCode !== 200) {
                this.log("setVolume() request returned http error: %s", response.statusCode);
                callback(new Error("setVolume() returned http error " + response.statusCode));
            } else {
                this.log("setVolume() successfully set volume to %s", volume);

                callback(undefined, body);
            }
        }.bind(this));
    },

    _httpRequest: function (url, body, method, callback) {
        var options = {
            url: url,
            method: method,
            json: true,
            rejectUnauthorized: false
        }

        if (body !== null) {
            options.body = body;
        }

        request(options, function (error, response, body) {
                callback(error, response, body);
            }
        )
    }
};
