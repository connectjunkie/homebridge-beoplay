# Bang & Olufsen/Beoplay accessory

This accessory allows you to control Bang & Olufsen Beoplay speakers and TVs using a HomeKit enabled iOS app or Siri (see notes below).  Currently this has only been tested on a Beoplay A9 mk2 speaker (although will hopefully work on a Beoplay V1 TV), so reports of success or issues with other Beoplay B&O devices are welcome.

Due to the limitations of speaker and TV support in HomeKit, devices can be represented in HomeKit as a number of different devices - including as a TV, speakers, lightbulb, or fan. Which device you choose will determine which features can be controlled in what way (please see below). 

Note that the plugin honours the B&O speaker's "maximum volume" setting, so trying to set the volume to higher than this will set the volume to the maximum, which may not be reflected in your HomeKit app until you refresh.

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
`type` | `speaker` | What device type to present to HomeKit to represent the BeoPlay device. Values can be "speaker", "bulb", "fan", or "tv". All have advantages and disadvantages - please see the notes below
`mode` | `power` if type is `tv`, otherwise `mute` | What behaviour to perform when the device is muted (speaker) or turned off (bulb, fan and TV). Values can be "mute" or "power" - please see the notes below
`on` | `input` if type is `tv`, otherwise `on` | Define whether to power on the device from standby using the API (available for speakers) or via setting an input (available for both speakers and TVs)
`default` | `1` | The input number selected to power on the device when coming out of standby
`inputs` | `undefined` | The inputs that can be selected from within the TV interface when using the TV integration. Available inputs will be parsed automatically if these values are not supplied, however by supplying these in the config you can customise which inputs are presented and the ordering. See below for the format.

# Notes

## Type parameter

Note that any of the types can be used regardless of whether the B&O device is actually a TV or a speaker, however functionality and how the device can be controlled will differ as show below. Note that for on/off control this could be used for putting the device in standby mode and waking it up, or for muting and unmuting the device, depending on how you have set the "mode" setting (see below).

Type | Apple Home app | Siri | Third party HomeKit app (ie Eve, Home+ etc)
--- | --- | --- | ---
`tv` | on/off and change input. Volume up/down via hardware buttons in Control Centre remote app | on/off | Not supported
`speaker` | Not supported | Not supported | May be supported (works in Eve, Home+)
`bulb` | on/off and volume | on/off and volume | on/off and volume
`fan` | on/off and volume | on/off and volume | on/off and volume

Note that for the `bulb` option, Siri will include the B&O device within commands that effect all lighting, so Siri will turn the speaker off if you say "Turn off the lights" and will change the volume if you say "Dim the lights to 20%". 

Note that the TV device support, the remote control support within the Control Centre remote (for media control etc) is not currently implemented. There is also a limitation in that only one TV can be exposed via Homebridge as an accessory at a time. This may mean that you won't be able to use this integration type if you already have another Homebridge TV plugin installed, or with multiple Beoplay devices - unless you have multiple instances of Homebridge running. 

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
- `type`: Can be one of `TV`, `HDMI`, `APPLICATION`, `AIRPLAY`, or `OTHER`
- `apiID`: This is the `id` value for the input in the Beoplay API. This can be found by browsing to the following URL path on your device: hxxp://x.x.x.x/BeoZone/Zone/ActiveSources/ 

# Credits
This plugin started life as a fork of the [homebridge-http-speaker](https://github.com/Supereg/homebridge-http-speaker) plugin by Supereg

Inspiration for the Lightbulb implementation is derived from a [fork of homebridge-sonos](https://github.com/dominicstelljes/homebridge-sonos) by Dominic Stelljes

Television implementation inspiration largely derived from the [homebridge-panasonic](https://github.com/g30r93g/homebridge-panasonic) plugin by George Nick Gorzynski