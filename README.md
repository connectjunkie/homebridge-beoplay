# Beoplay/Bang & Olufsen accessory

This accessory allows you to control Bang & Olufsen (Beoplay) speakers using a HomeKit enabled iOS app or Siri (see notes below).  Currently this has only been tested on a Bang & Olufsen A9v1 speaker, so reports of success or issues with other B&O speakers is welcome.

At this point only the ability to set the volume and mute the speaker is supported (see notes below).

# Installation

Homebridge is published through [NPM](https://www.npmjs.com/package/homebridge) and should be installed "globally" by typing:

    sudo npm install -g homebridge
    sudo npm install -g homebridge-beoplay

If you don't have Homebridge installed, [check the repository](https://github.com/nfarina/homebridge) for detailed setup instructions.

# Configuration

The plugin is configured as part of your Homebridge `config.json` file.

## Example addition to existing config.json:

      "accessories": [
        {
          "accessory": "Beoplay",
          "name": "Bedroom Speakers",
          "ip": "192.168.x.x",
          "type": "speaker"
        }
      ]

The "type" parameter is optional, and defaults to "speaker". See the notes below for usage. 

# Notes

The speaker support in HomeKit is limited - only the Mute functionality is supported and the default iOS Home app does not support speakers at all. Third party HomeKit apps do support speakers and do work for setting volume as well (for example - the [Elgato Eve app](https://apps.apple.com/gb/app/eve-for-homekit/id917695792)) however you will not be able to control the speaker with Siri.

For this reason this plugin also supports exposing the speaker as a Switch by setting "type" to "switch" in your config.json. This will allow the Speaker to be muted/unmuted using Siri, although it is currently unintuitive as you are turning on and off mute, so will be opposite behaviour to what most people are expecting.  