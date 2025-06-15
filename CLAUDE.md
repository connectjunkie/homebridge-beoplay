# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Homebridge plugin for controlling Bang & Olufsen (Beoplay) speakers and TVs through HomeKit. The plugin exposes B&O devices as various HomeKit accessory types (TV, speaker, smart speaker, lightbulb, fan, or switch) to work around HomeKit limitations.

## Development Commands

No build process is required - this is a pure ES module package. Common commands:

- `npm install` - Install dependencies
- `npm test` - No test framework configured
- No linting commands specified in package.json

## Architecture

### Core Components

- `index.js` - Entry point that registers the platform with Homebridge
- `lib/BeoplayPlatform.js` - Main platform class that manages device initialization
- `lib/BeoplayPlatformDevice.js` - Individual device implementation with B&O API communication
- `lib/Constants.js` - Shared constants

### Key Architecture Patterns

**ES Modules**: The codebase uses ES modules (`"type": "module"` in package.json) with import/export syntax.

**Device Types**: Each B&O device can be represented as different HomeKit accessory types:
- `tv` - Television with input switching and remote control
- `speaker`/`smartspeaker` - Audio devices with volume/mute control
- `bulb`/`fan`/`switch` - Alternative representations mapping volume to brightness/speed

**API Communication**: Uses B&O's REST API on port 8080 with endpoints like:
- `/BeoDevice` - Device information
- `/BeoZone/Zone/Sound/Volume` - Volume control
- `/BeoZone/Zone/ActiveSources` - Input management
- `/BeoNotify/Notifications` - Real-time notifications via streaming

**Notification Streaming**: Maintains persistent NDJSON stream connections to receive real-time device state updates.

**Accessory Management**: Differentiates between bridge accessories (most types) and external accessories (TV/smart speaker) which appear as separate HomeKit devices.

## Configuration

Device configuration is entirely in the `devices` array within the platform config. Each device requires `name` and `ip`, with optional parameters for `type`, `mode`, `on`, `default`, `inputs`, `exclude`, and `speakergroups`.

The plugin auto-detects TV vs speaker devices based on available inputs (HDMI/TV inputs indicate a TV).

## Important Notes

- Requires Node.js ^16.20.2 || ^18.19.0 || ^20.10.0 and Homebridge ^1.7.0
- Only works with legacy B&O devices, NOT Mozart platform devices (Beolab 28, Beosound Balance, etc.)
- TV and smart speaker accessories are published as external accessories requiring manual HomeKit pairing