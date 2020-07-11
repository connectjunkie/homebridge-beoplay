# Homebridge plugin for Bang & Olufsen/Beoplay devices

This plugin allows you to control Bang & Olufsen Beoplay speakers and TVs using a HomeKit enabled iOS app or Siri (see notes below).  Currently this has only been tested on a Beoplay A9 mk2 speaker (although will hopefully work on a Beoplay V1 TV), so reports of success or issues with other Beoplay B&O devices are welcome.

Due to the limitations of speaker and TV support in HomeKit, devices can be represented in HomeKit as a number of different devices - including as a TV, speaker, lightbulb, or fan. Which device you choose will determine which features can be controlled in what way (please see below). 

Note that the plugin honours the B&O speaker's "maximum volume" setting, so trying to set the volume to higher than this will set the volume to the maximum, which may not be reflected in your HomeKit app until you refresh.

# Installation

Homebridge is published through [NPM](https://www.npmjs.com/package/homebridge) and should be installed "globally" by typing:

    sudo npm install -g homebridge
    sudo npm install -g homebridge-beoplay

If you don't have Homebridge installed, [check the repository](https://github.com/nfarina/homebridge) for detailed setup instructions.

# Community

Note there is now a `#beoplay` group on the Homebridge community on [Discord](https://discord.gg/Z8jmyvb) for any usage and setup queries and/or bug reports.

# Configuration

The plugin is configured as part of your Homebridge `config.json` file.

## Example addition to existing config.json:

      "platforms": [
        {
          "platform": "Beoplay",
          "devices": [
            {
              "name": "Bedroom Speakers",
              "ip": "192.168.x.x"
            },
            {
              "name": "Living Room TV",
              "ip": "192.168.x.x"
            }
          ]
        }
      ]

Only the name and ip options are required, however there are a number of optional parameters supported in order to modify the device behaviour:

Option | Default | Explanation
--- | --- | ---
`type` | `speaker` | What device type to present to HomeKit to represent the BeoPlay device. Values can be "speaker", "bulb", "fan", or "tv". All have advantages and disadvantages - please see the notes below
`mode` | `power` if type is `tv`, otherwise `mute` | What behaviour to perform when the device is muted (speaker) or turned off (bulb, fan and TV). Values can be "mute" or "power" - please see the notes below
`on` | `input` if type is `tv`, otherwise `on` | Define whether to power on the device from standby using the API (available for speakers) or via setting an input (available for both speakers and TVs)
`default` | `1` | The input number selected to power on the device when coming out of standby
`inputs` | `undefined` | The inputs that can be selected from within the TV interface when using the TV integration. Available inputs will be parsed automatically if these values are not supplied, however by supplying these in the config you can customise which inputs are presented and the ordering. See below for the format
`exclude` | `undefined` | If you don't supply inputs manually (via `inputs` above) these will be parsed automatically from the device. The `exclude` option allows you to exclude specific inputs from being automatically setup - for example, on a speaker its unlikely you use all of the supported music services, and on a TV you may not use all of the available inputs. See below for the format.

## Migration from plugin version 0.x.x to 1.x.x

This plugin has transitioned from being an Accessory plugin to a Platform plugin. While backward compatibility has been retained for now, you should migrate to the new platform configuration in your config.json if you plan to use the TV integration at all - especially with multiple devices using this integration or with iOS 14.

Note that the primary difference between the Accessory plugin setup and Platform plugin setup is that TVs are exposed differently to the Home app. On migration you will need to add each device using the TV integration as an external device in the Home app (it will not be added automatically) as per the guidance below. 

## Adding your TVs to the Home app
Note that devices using the TV integration are exposed as external accessories and as such will not automatically be shown in the Home app or Control Centre remote - they need to be added as if they were a standalone HomeKit device.

To add a TV to HomeKit follow this steps:
* Open the Home app
* Select Add Accessory
* Tap on "I Don't Have a Code or Cannot Scan"

The TV should appear on the next page. Select it and when asked for a PIN, use the same PIN you used for Homebridge (in the `bridge` section of your `config.json`). If you have multiple TVs, follow the same process for them all.

# Notes

## Type parameter

Note that any of the types can be used regardless of whether the B&O device is actually a TV or a speaker, however functionality and how the device can be controlled will differ as shown below. Note that how you have set the "mode" setting (see below) will determine whether on/off control will standby/wakeup the device or mute/unmute the device.

Type | Apple Home app | Siri | Third party HomeKit app (ie Eve, Home+ etc)
--- | --- | --- | ---
`tv` | on/off and change input. Volume up/down via hardware buttons in Control Centre remote app | on/off | Not supported
`speaker` | Not supported | Not supported | May be supported (works in Eve, Home+)
`bulb` | on/off and volume | on/off and volume | on/off and volume
`fan` | on/off and volume | on/off and volume | on/off and volume

Note that for the `bulb` option, Siri will include the device within commands that effect all lighting, so Siri will turn the speaker off if you say "Turn off the lights" and will change the volume if you say "Dim the lights to 20%". 

Note that for the `tv` option the remote control support within the Control Centre remote (for media control etc) is not currently implemented. There is also a limitation in that only one TV can be exposed via Homebridge as an accessory at a time. This may mean that you won't be able to use this integration type if you already have another Homebridge TV plugin installed, or with multiple B&O devices - unless you have multiple instances of Homebridge running. 

## Mode parameter

The plugin will mute a speaker, fan or bulb by default. By setting "mode" to "power" the plugin will instead put the device into standby mode instead of muting. This may be preferable, depending on what  behaviour you are looking for.

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
- `apiID`: This is the `id` value for the input in the Beoplay API. This can be found by browsing to the following URL path on your device: http://x.x.x.x:8080/BeoZone/Zone/ActiveSources/ 

Ensure that you add all inputs that you may use - if you don't supply an input that is later used outside of Homebridge (for example, AirPlay or Bluetooth) then the value will display incorrectly in the Home app, and the input on your device may be changed to one you have defined.

## Exclude parameter

Note that you can either supply an `inputs` value or an `exclude` value - if you supply both the `exclude` option will be ignored.

Exclude options for the TV integration type are defined as follows:

    "exclude": [
      "radio:1111.222222.33333333@products.bang-olufsen.com",
      "bluetooth:1111.2222222.33333333@products.bang-olufsen.com"
    ]

The values to supply are the `id` value for the input in the Beoplay API. As per for the `inputs` values, the inputs supported by your device can be found by browsing to the following URL path on your device: http://x.x.x.x:8080/BeoZone/Zone/ActiveSources/ 

Ensure that you don't exclude inputs that you may use - if an excluded input is later used outside of Homebridge (for example AirPlay or Bluetooth) then the value will display incorrectly in the Home app, and the input on your device may be changed to one you have defined. 

# Credits
This plugin started life as a fork of the [homebridge-http-speaker](https://github.com/Supereg/homebridge-http-speaker) plugin by Supereg

Inspiration for the Lightbulb implementation is derived from a [fork of homebridge-sonos](https://github.com/dominicstelljes/homebridge-sonos) by Dominic Stelljes

Television implementation inspiration largely derived from the [homebridge-panasonic](https://github.com/g30r93g/homebridge-panasonic) plugin by George Nick Gorzynski

Inspiration for the combined platform/accessory plugin (and therefore not breaking backward compatibility) taken from the [homebridge-webos-tv](https://github.com/merdok/homebridge-webos-tv/) plugin by merdok