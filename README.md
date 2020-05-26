# Bang & Olufsen/Beoplay accessory

This accessory allows you to control Bang & Olufsen BeoPlay speakers and TVs using a HomeKit enabled iOS app or Siri (see notes below).  Currently this has only been tested on a BeoPlay A9 mk2 speaker and Beoplay V1 TV, so reports of success or issues with other BeoPlay B&O devices are welcome.

Depending on which integration option is selected (speaker, bulb or TV) will depend on which features can be controlled - speaker and bulb integrations support volume and either mute or standby/enable, while the TV integration also allows selection of active input. Note that the plugin honours the B&O speaker's "maximum volume" setting, so trying to set the volume to higher than this will set the volume to the maximum, which may not be reflected in your HomeKit app until you refresh.

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
          "ip": "192.168.x.x"
        }
      ]

Only the name and ip options are required, however there are a number of optional parameters supported in order to modify the device behaviour:

Option | Default | Explanation
--- | --- | ---
`type` | `speaker` | What device type to present to HomeKit to represent the BeoPlay device. Values can be "speaker", "bulb", or "tv". All have advantages and disadvantages - please see the notes below
`mode` | `mute` | What behaviour to perform for speaker or bulb integrations when the device is muted (speaker integration) or turned off (bulb). Values can be "mute" or "power" - please see the notes below
`on` | `input` if type is `tv`, otherwise `on` | Define whether to power on the device from standby using the API (available for speakers) or via setting an input (available for both speakers and TVs)
`default` | `1` | The input number selected to power on the device when coming out of standby
`inputs` | `undefined` | The inputs that can be selected from within the TV interface when using the TV integration. See below for the format.

# Notes

## Type parameter

The speaker support in HomeKit is limited - only the Mute functionality is supported on a Speaker by default and the  iOS Home app (as of iOS 13) does not support speakers at all. Third party HomeKit apps may support speakers and may work for setting volume as well (for example - the [Elgato Eve app](https://apps.apple.com/gb/app/eve-for-homekit/id917695792) works) however you will not be able to control the speaker with Siri.

For this reason this plugin also supports exposing the speaker as a Lightbulb (as per [this fork of the Sonos plugin](https://github.com/dominicstelljes/homebridge-sonos)) by setting "type" to "bulb" in your config.json. This will allow the Speaker to be muted/unmuted using Siri and the Home app, and allow the volume to be set as well. This will have some side effects though - Siri will mute the speaker if you say "Turn off the lights" and will change the volume if you say "Dim the lights to 20%". 

The television suppport introduced with iOS 12.2 is also supported for exposing the device (regardless of whether the device is actually a TV). This support is currently incomplete as it is a work in progress, and there is a limitation in that only one TV can be exposed via Homebridge as an accessory at a time. This may mean that you won't be able to use this integration type if you already have another Homebridge TV plugin installed, or with multiple BeoPlay devices - unless you have multiple instances of Homebridge running.

## Mode parameter

The plugin will mute a speaker or bulb by default. By setting "mode" to "power" the plugin will instead put the speaker into standby mode instead of muting. This may be preferable, depending on what speaker/bulb behaviour you are looking for.

## Inputs parameter

Inputs for the TV integation type are defined as follows:

    "inputs": [{
            "name": "Tune In",
            "type": "APPLICATION",
            "apiID": "radio:1111.222222.33333333@products.bang-olufsen.com"
        },
        {
            "name": "Bluetooth",
            "type": "OTHER",
            "apiID": "bluetooth:1111.2222222.33333333@products.bang-olufsen.com"
        }
    ]

The values are as follows:
- `name`: Name for the input in the interface
- `type`: Can be one of `TUNER`, `HDMI`, `APPLICATION`, `AIRPLAY`, or `OTHER`
- `apiID`: This is the `id` value for the input in the BeoPlay API. This can be found by browsing to the following URL path on your device: /BeoZone/Zone/ActiveSources/ 

# Credits
This plugin started life as a fork of the [homebridge-http-speaker](https://github.com/Supereg/homebridge-http-speaker) plugin by Supereg

Inspiration for the Lightbulb implementation is derived from a [fork of homebridge-sonos](https://github.com/dominicstelljes/homebridge-sonos) by Dominic Stelljes

Television implementation inspiration largely derived from the [homebridge-panasonic](https://github.com/g30r93g/homebridge-panasonic) plugin by George Nick Gorzynski