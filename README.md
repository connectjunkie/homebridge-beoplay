# Homebridge plugin for Bang & Olufsen/Beoplay devices
[![NPM downloads](https://flat.badgen.net/npm/dt/homebridge-beoplay?color=blue)](https://npmjs.com/package/homebridge-beoplay)
[![NPM version](https://flat.badgen.net/npm/v/homebridge-beoplay?color=blue)](https://npmjs.com/package/homebridge-beoplay)
[![Homebridge Discord](https://img.shields.io/discord/432663330281226270?color=728ED5&logo=discord&label=discord)](https://discord.gg/hGmGFh9)
[![GitHub issues](https://flat.badgen.net/github/open-issues/connectjunkie/homebridge-beoplay?label=issues&color=green)](https://github.com/connectjunkie/homebridge-beoplay/issues)
[![GitHub pull requests](https://flat.badgen.net/github/prs/connectjunkie/homebridge-beoplay?label=pull%20requests&color=green)](https://github.com/connectjunkie/homebridge-beoplay/pulls)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![Licence](https://flat.badgen.net/npm/license/homebridge-beoplay?color=red)](LICENSE)

This plugin allows you to control Bang & Olufsen Beoplay speakers and TVs using a HomeKit enabled iOS app or Siri. Note that this plugin does NOT work with B&O devices that use the new Mozart platform such as the Beolab 28, Beosound Balance, Beosound Emerge, Beosound Level or Beosound Theatre.

Due to the limitations of support for speakers in HomeKit, B&O devices can be represented in HomeKit as a number of different devices - including as a TV, speaker, smart speaker, lightbulb, switch or fan. Which device you choose will determine which features can be controlled in which way (please see below). 

Note that the plugin honours the B&O device's "maximum volume" setting, so trying to set the volume to higher than this will set the volume to the maximum.

# Community

Note there is now a `#beoplay` group on the Homebridge community on [Discord](https://discord.gg/hGmGFh9) for any usage and setup queries and/or bug reports.

# Installation

**Option 1: Install via Homebridge Config UI X:**

Search for "beoplay" in [homebridge-config-ui-x](https://github.com/oznu/homebridge-config-ui-x) and install `homebridge-beoplay`.

**Option 2: Install via HOOBS:**

Search for "homebridge-beoplay" in [HOOBS](https://hoobs.org) and install.

**Option 3: Manually Install:**

```
sudo npm install -g homebridge-beoplay
```

# Configuration

The plugin is configured as part of your Homebridge `config.json` file.

**Option 1: Configure via Homebridge Config UI X:**

`homebridge-beoplay` supports plugin configuration within Config-UI-X (Plugins -> Homebridge Beoplay -> Settings). Note that most of the options (as noted below) are optional. Where you have multiple B&O devices you want to configure, make sure to add additional devices using the `Add B&O/Beoplay Device` button at the bottom of the configuration interface.

**Option 2: Configure Manually:**

The following is an example addition to an existing config.json. See below for valid options and values you can provide. Please note, `homebridge-beoplay` does not have any platform level settings - all settings are at the device level.

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

**Option 3: Configure via HOOBS:**

Within the HOOBS interface you will  be presented with a "Devices" box within the interface when first installing the plugin. This should be configured as above ("Option 2: Configure Manually"), by supplying only the values for the `devices` section, as below: 

          [
            {
              "name": "Bedroom Speakers",
              "ip": "192.168.x.x"
            },
            {
              "name": "Living Room TV",
              "ip": "192.168.x.x"
            }
          ]

## Options

Only the name and ip options are required. The defaults should be sensible in most cases, however there are a number of optional parameters supported in order to modify the device behaviour:

Option | Default | Explanation
--- | --- | ---
`type` | `fan` for speakers, `tv` for TVs | What device type to represent the BeoPlay device as in HomeKit. Values can be `speaker`, `smartspeaker`, `bulb`, `fan`, `switch` or `tv`. All have advantages and disadvantages - please see additional detail below
`mode` | `mute` if type is `speaker` or `smartspeaker`, otherwise `power` | What behaviour to perform when the device is muted (speaker, smartspeaker) or turned off (bulb, fan, switch and TV). Values can be `mute` or `power` - please see additional detail below
`on` | `input` if type is `tv`, otherwise `on` | Define whether to power on the device from standby using the API (`on` - available for speakers), via setting an input (`input` - available for both speakers and TVs), or via joining a B&O multiroom experience (`join`)
`default` | `1` | The input number selected to power on the device when coming out of standby. Used when using an `on` value of `input`
`maxvolumescaling` | `false` | By default when you set the volume, the device cannot be set to higher than the maximum volume defined for the device (e.g. that you setup in the B&O app). Set this value to `true` to change how volume is represented to be the percentage of the maximum volume for the device (e.g. if you set volume to 50, it will be set to 50% of the device's max volume)
`inputs` | `undefined` | The inputs that can be selected from within the TV interface when using the TV integration. Available inputs will be parsed automatically if these values are not supplied, however by supplying these in the config you can customise which inputs are presented and the ordering. See below for the format
`exclude` | `undefined` | If you don't supply inputs manually (via `inputs` above) these will be parsed automatically from the device. The `exclude` option allows you to exclude specific inputs from being automatically setup - for example, on a speaker its unlikely you use all of the supported music services, and on a TV you may not use all of the available inputs. See below for the format.
`speakergroups` | `undefined` | If you don't supply speaker groups these will be parsed automatically from the device. See below for the format.

## Adding your TVs and Smart Speakers to the Home app
Note that devices using the TV and Smart Speaker integrations are exposed as external accessories and as such will not automatically be shown in the Home app or Control Centre remote - they need to be added as if they were a standalone HomeKit device.

To add a TV or Smart Speaker to HomeKit follow this steps:
* Open the Home app
* Select Add Accessory
* Tap on the "More options..." link

The TV or Smart Speaker should appear on the next page. Select it and when asked for a PIN, use the same PIN you used for Homebridge (in the `bridge` section of your `config.json`). If you have multiple devices using these integrations, follow the same process to add each.

# Option details

## Type parameter

Note that any of the types can be used if your B&O device is a speaker - TVs will only use the `tv` type. Functionality and how the device can be controlled will differ as shown below. Note that how you have set the "mode" setting (see below) will determine whether on/off control will standby/wakeup the device or mute/unmute the device.

Type | Apple Home app | Siri | Third party HomeKit app (ie Eve, Home+ etc)
--- | --- | --- | ---
`tv` | on/off and change input. Volume up/down via hardware buttons and media control in Control Centre remote | on/off | Not supported
`speaker` | Not supported | Not supported | May be supported (works in Eve, Home+) for mute/unmute and volume
`smartspeaker` | play/pause. Volume setting supported via creating a Scene or Automation | Not supported | Not supported
`bulb` | on/off and volume | on/off and volume | on/off and volume
`fan` | on/off and volume | on/off and volume | on/off and volume
`switch` | on/off | on/off | on/off and volume

Note that for the `bulb` option, Siri will include the device within commands that effect all lighting, so Siri will turn the speaker off if you say "Turn off the lights" and will change the volume if you say "Dim the lights to 20%". 

Note for the `smartspeaker` option that you can only adjust the volume, pause audio and resume audio within a HomeKit Scene/Automation. You cannot use the `Play Audio` option with this plugin as that uses Airplay 2, not HomeKit, to play the audio.

## Mode parameter

The plugin will mute/unmute if using the speaker/smartspeaker integration type when the HomeKit mute button is selected/unselected, and turn on/off if using the TV, bulb switch, or fan integrations when the HomeKit power button is on/off. By setting "mode" to "power" the plugin will instead power on/standby your speaker/smartspeaker integration when you unmute/mute. By setting "mode" to "mute" the plugin will instead mute/unmute a fan, bulb, switch or TV integration when the power button is turned off/on. This may be preferable, depending on what behaviour you are looking for.

## TV Media Control in the Control Center Remote

For TV integrations, volume can be incremented/decremented via the hardware buttons on your iOS device in the Control Center Remote application. 

Additionally, the following functionality has been mapped to each of the following buttons in the Control Centre Remote:

Button | Functionality  
--- | --- 
Arrow Up | Next Speaker Group
Arrow Down | Previous Speaker Group
Arrow Left | Media Back
Arrow Right | Media Forward
Select (Button in Middle of Arrows) | Toggle Mute
Play/Pause | Play/Pause
Back | Leave Multiroom Experience
Information | Join Multiroom Experience

## Inputs parameter

Inputs for the TV integration type are defined as follows:

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

## Exclude parameter

Note that you can either supply an `inputs` value or an `exclude` value - if you supply both the `exclude` option will be ignored.

Exclude options for the TV integration type are defined as follows:

    "exclude": [
      "radio:1111.222222.33333333@products.bang-olufsen.com",
      "bluetooth:1111.2222222.33333333@products.bang-olufsen.com"
    ]

The values to supply are the `id` value for the input in the Beoplay API. As per for the `inputs` values, the inputs supported by your device can be found by browsing to the following URL path on your device: http://x.x.x.x:8080/BeoZone/Zone/ActiveSources/ 

## Speakergroups parameter

You can supply speaker groups manually in the following format. This is optional as they will be parsed from the device if this parameter is not supplied:

    "speakergroups": [{
            "id": 1,
            "name": "Speaker Group 1"
        },
        {
            "id": 2,
            "name": "Speaker Group 2"
        }
    ]

The values to supply for the `id` value for each speaker group can be found by browsing to the following URL path on your device: http://x.x.x.x:8080/BeoZone/Zone/Sound/SpeakerGroup/ 

# Credits
This plugin started life as a fork of the [homebridge-http-speaker](https://github.com/Supereg/homebridge-http-speaker) plugin by Supereg

Inspiration for the Lightbulb implementation is derived from a [fork of homebridge-sonos](https://github.com/dominicstelljes/homebridge-sonos) by Dominic Stelljes

Television implementation inspiration largely derived from the [homebridge-panasonic](https://github.com/g30r93g/homebridge-panasonic) plugin by George Nick Gorzynski

Inspiration for patterns on handling cached accessories taken from the [homebridge-dyson-pure-cool](https://github.com/lukasroegner/homebridge-dyson-pure-cool) plugin by Lukas Rögner