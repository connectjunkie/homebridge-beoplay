// use createRequire as importing JSON still experimental in ES
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const settings = require('../package.json')

// exports
export const PLUGIN_NAME = 'homebridge-beoplay'
export const PLATFORM_NAME = 'Beoplay'
export const PLUGIN_VERSION = settings.version