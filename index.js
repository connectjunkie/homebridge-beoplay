import BeoplayPlatform from './lib/BeoplayPlatform.js'
import { PLUGIN_NAME, PLATFORM_NAME } from './lib/Constants.js'

export default function main (homebridge) {
  homebridge.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, BeoplayPlatform, true)
}
