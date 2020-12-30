# Change Log

All notable changes from version 1.0.0 to this project will be documented in this file. This project uses [Semantic Versioning](https://semver.org/).

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