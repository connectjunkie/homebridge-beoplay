# Bang & Olufsen/Beoplay accessory

This accessory allows you to control Bang & Olufsen (Beoplay) speakers using a HomeKit enabled iOS app or Siri (see notes below).  Currently this has only been tested on a Bang & Olufsen A9 mk2 speaker, so reports of success or issues with other B&O speakers are welcome.

At this point the ability to set the volume and mute, pause/play or standby the speaker is supported (see notes below). Note that the plugin honours the B&O speaker's "maximum volume" setting, so trying to set the volume to higher than this will set the volume to the maximum, which may not be reflected in your HomeKit app until you refresh.

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
          "type": "speaker",
          "mode": "mute"
        }
      ]

The "type" parameter is optional, and defaults to "speaker". The "mode" parameter is optional, and defaults to "mute". See the notes below for usage. 

# Notes

## Type parameter

The speaker support in HomeKit is limited - only the Mute functionality is supported on a Speaker by default and the iOS Home app (as of iOS 13) does not support speakers at all. Third party HomeKit apps may support speakers and may work for setting volume as well (for example - the [Elgato Eve app](https://apps.apple.com/gb/app/eve-for-homekit/id917695792) works) however you will not be able to control the speaker with Siri.

For this reason this plugin also supports exposing the speaker as a Lightbulb (as per [this fork of the Sonos plugin](https://github.com/dominicstelljes/homebridge-sonos)) by setting "type" to "bulb" in your config.json. This will allow the Speaker to be muted/unmuted using Siri and the Home app, and allow the volume to be set as well. 

This will have some side effects though - Siri will mute/standy/pause the speaker if you say "Turn off the lights" and will change the volume if you say "Dim the lights to 20%". 

## Mode parameter

The plugin will mute the speaker by default. However, two other modes are also supported based on what type of automation behaviour is preferred: 
* by setting "mode" to "power" the plugin will instead put the speaker into standby mode instead of muting
* by setting "mode" to "pause" the plugin will instead pause/play the current speaker source instead of muting

# Credits
This plugin started life as a fork of the [homebridge-http-speaker](https://github.com/Supereg/homebridge-http-speaker) plugin by Supereg

Inspiration for the Lightbulb implementation is derived from a [fork of homebridge-sonos](https://github.com/dominicstelljes/homebridge-sonos) by Dominic Stelljes.