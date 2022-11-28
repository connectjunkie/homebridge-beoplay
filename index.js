import BeoplayAccessory from './lib/BeoplayAccessory.js'
import BeoplayPlatform from './lib/BeoplayPlatform.js'
import { PLUGIN_NAME, PLATFORM_NAME } from './lib/Constants.js'

export default function main (homebridge) {
  homebridge.registerAccessory(PLUGIN_NAME, PLATFORM_NAME, BeoplayAccessory)
  homebridge.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, BeoplayPlatform, true)
}
