# Change Log

All notable changes from version 1.0.0 to this project will be documented in this file. This project uses [Semantic Versioning](https://semver.org/).

## 1.3.22 (2021-12-20)
### Maintenance
* Reverting the version of got (HTTP client) used to the non-ESM version

## 1.3.21 (2021-12-17)
### Maintenance
* Bumping versions for Homebridge and Node to current versions
* Bumping dependencies

## 1.3.20 (2021-10-28)
### Maintenance
* Bumping versions for Homebridge and Node to current versions
* Locking package dependencies to specific version numbers
* 1.3.19 was not released - skipping

## 1.3.18 (2021-08-03)
### Bug Fixes
* Fix for reading inputs from certain B&O TVs

## 1.3.17 (2021-08-03)
### Bug Fixes
* Minor changes in TV detection
* Improve input debugging
* 1.3.16 was not released - skipping

## 1.3.15 (2021-08-02)
### Bug Fixes
* Broken dependency

## 1.3.14 (2021-08-02)
### Bug Fixes
* Added better detection and logging for B&O TVs that don't have tuners

## 1.3.13 (2021-06-28)
### Bug Fixes
* Added speaker groups to the settings that can be configured in Config-UI-X

## 1.3.12 (2021-06-23)
### Enhancements
* The TV integration will now dynamically add an input that you haven't defined if you change the device to that input outside of the plugin

## 1.3.11 (2021-02-19)
### Bug Fixes
* Minor fixes to callbacks for Homebridge 1.3.0 compatibility

## 1.3.10 (2021-01-30)
### Enhancements
* Better support in TV integration for where no input is set. There will now be a 'None' input that will be visible in the interface

## 1.3.9 (2021-01-21)
### Enhancements
* Support for changing Speaker Groups in the TV integration using the Control Center remote

## 1.3.8 (2021-01-18)
### Bug Fixes
* Fixes for a JavaScript scope error in notifications stream error handling code

## 1.3.7 (2021-01-12)
### Enhancements
* Homebridge-beoplay is now a verified plugin
* Enhancements to README to document how to configure the plugin for HOOBS

## 1.3.6 (2021-01-11)
### Bug Fixes
* Improve error handling for situations where there is no connectivity/wrong IP address supplied
* JavaScript Standard updates and removing unhandled errors from legacy Accessory code 

## 1.3.5 (2021-01-07)
### Bug Fixes
* Fixed issue where TVs and Smart Speakers were not published properly as external accessories

## 1.3.4 (2021-01-07)
### Bug Fixes
* Allow the same device to be used as multiple integration types (e.g. TV and bulb at the same time) (#14)

## 1.3.3 (2021-01-06)
### Enhancement
* Improve error handling of malformed config.json
* Validation cover increased to all config.json values

## 1.3.2 (2021-01-04)
### Enhancement
* Improve descriptions on Config-UI-X settings configuration screen

## 1.3.1 (2021-01-04)
### Bug Fixes
* Fix for validating API ids with underscores and numbers

## 1.3.0 (2021-01-03)
### Features
* Initial support for using the Control Center Remote to control devices using the TV integration

### Bug Fixes
* Fix to only mute a Speaker integration if the type is set to Mute
* Added missing updates for SmartSpeaker mute and volume settings (not visible in the Home app)
* Fix for HAP Characteristic error message
* Fixed muting behaviour for TVs and Smart Speakers (not visible in the Home app)

## 1.2.1 (2020-12-30)
### Bug Fixes
* Fix breaking change introduced in 1.2.0 if you were using any type other than a Smart Speaker

## 1.2.0 (2020-12-30)
### Features
* Initial support for presenting your B&O device as a HomeKit SmartSpeaker

## 1.1.0 (2020-12-28)
### Features
* Changes the basis the plugin accesses the device to subscribing to state notifications, so user experience where the device is also controlled outside of HomeKit will be better as it will reflect those state changes

## 1.0.1 (2020-10-03)

### Features
* Initial support for powering on via joining a B&O multiroom experience

## 1.0.0 (2020-09-26)

### Features
* First release of homebridge-beoplay as a platform plugin. All users will need to update their config via the UI or via editing config.json in order to take advantage of fixes and enhancements in the platform version. See instructions in the README on how to update your configuration
* Backwards compatibility with homebridge-beoplay as an accessory plugin has been maintained for now (at version 0.2.9). No enhancements will be made to the legacy accessory plugin going forward

### Bug Fixes
* Multiple TVs are now properly supported in the platform plugin - all configured TVs will now show up in the Control Centre remote. Note that TVs are now exposed to HomeKit as external accessories, so these will need to be added to the Home app individually - see instructions in the README on how to do this.
* TVs will show with the correct icon in iOS 14 in the platform plugin