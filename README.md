# Globie Earth

An Amazon Vega OS (Fire TV) app that turns the [Globie Earth MCP](https://mcp.globie.earth/mcp) catalogue into a 10-foot TV experience: a browsable forest/podcast shelf and an AI-assisted smart player with a podcast mode.

Built for the Amazon hackathon (Fire TV / Vega OS track) on top of the Amazon [react-native-multi-tv-helloworld](https://github.com/AmazonAppDev/react-native-multi-tv-helloworld) monorepo template. It pairs with the Globie Earth Alexa skill: a spoken `pair my tv` hands the TV a six-digit code, and the skill then drives the app's quests, search and family quiz over the MCP server's `/v1/tv/commands` relay.

## Introduction

A Yarn 4 workspace with two packages:

- `@multitv/shared` — design system (tokens, scaling, drawn cover art, focus-aware components) and platform-agnostic services (MCP client, AsyncStorage resume state)
- `@multitv/vega` — the Vega OS app: manifest, dependency wiring, Jest setup, `App.tsx`

### Supported Platform

| Platform      | Target Devices |
| ------------- | -------------- |
| Vega (Kepler) | Fire TV, Vega Virtual Device |

## Project Structure

```
├── package.json                 # Root workspace config (Yarn 4)
├── packages/
│   ├── shared/                  # @multitv/shared
│   │   ├── src/
│   │   │   ├── components/      # CoverArt, FocusCard, Chip, Shelf, InfoTile, StateView
│   │   │   ├── theme/           # Design tokens + 1920x1080 scaling
│   │   │   ├── utils/           # Colour derivation, scaling helpers
│   │   │   └── services/        # MCP client, HTTP client, AsyncStorage
│   │   └── index.ts             # Public API exports
│   └── vega/                    # @multitv/vega
│       ├── src/
│       │   └── App.tsx
│       ├── test/
│       ├── manifest.toml
│       └── package.json
```

## Prerequisites

- [Node.js](https://nodejs.org/) 20 or higher
- [Yarn](https://yarnpkg.com/) 4.5.0 or higher
- [Git](https://git-scm.com/)

**Vega (Fire TV)**

Vega development requires the Vega SDK and Yarn configuration for Amazon device packages.

1. [Install the Vega Developer Tools](https://developer.amazon.com/docs/vega/latest/install-vega-sdk.html)
2. [Configure Yarn for Vega](https://developer.amazon.com/docs/vega/latest/configure-package-managers.html)

## Quick Start

```bash
# Install all workspace dependencies
yarn

# Build the Vega/Fire TV app (debug)
yarn vega:build

# Run on Vega Virtual Device (Mac M-series)
yarn vega:vvd:mseries

# Run on Vega Virtual Device (Intel/x86_64)
yarn vega:vvd:intel

# Run on a Fire TV Stick (pass DSN)
yarn vega:firetv <DSN>

# Tests
yarn workspace @multitv/shared test
yarn workspace @multitv/vega test

# Type-check
yarn workspace @multitv/vega exec tsc --noEmit -p tsconfig.json
```

## Build and Run

You can build and run using either the CLI or the [Vega Studio IDE extension](https://developer.amazon.com/docs/vega/0.22/setup-extension.html). We recommend the IDE, which provides build, run, and device management directly from the sidebar panel. Vega Studio also has [monorepo support](https://developer.amazon.com/docs/vega/0.22/monorepo-support.html) that automatically detects the workspace layout and imports Vega sub-packages when you open the project.

### Vega (Fire TV) CLI

Build the project:

```bash
# Debug build (recommended for development, enables Fast Refresh)
yarn workspace @multitv/vega run build:debug

# Release build
yarn workspace @multitv/vega run build:release
```

Run on a Vega virtual device:

```bash
vega virtual-device start

# Mac M-series (aarch64) - using yarn script
yarn vega:vvd:mseries

# Intel Mac (x86_64) - using yarn script
yarn vega:vvd:intel

# Or directly with the Vega CLI
# Mac M-series (aarch64)
vega run-app packages/vega/build/aarch64-debug/vega_aarch64.vpkg earth.globie.tv.main -d VirtualDevice

# Intel Mac (x86_64)
vega run-app packages/vega/build/x86_64-debug/vega_x86_64.vpkg earth.globie.tv.main -d VirtualDevice
```

Run on a Fire TV Stick (replace `<DSN>` with your device serial number):

```bash
# Using the yarn script
yarn vega:firetv <DSN>

# Or directly
vega run-app packages/vega/build/armv7-release/vega_armv7.vpkg earth.globie.tv.main -d <DSN>
```

The `vega run-app` command takes the form `vega run-app <Vpkg path> <App ID> -d <device>`. The App ID is `<package id>.<component name>` from [manifest.toml](./packages/vega/manifest.toml), here `earth.globie.tv` + `main` = `earth.globie.tv.main`. Use `VirtualDevice` for the VVD or the device serial number (DSN) for a Fire TV Stick. See the [Vega CLI reference](https://developer.amazon.com/docs/vega/0.22/cli-tools.html) for details.

[Fast Refresh](https://reactnative.dev/docs/fast-refresh) is available in debug builds. See [Set Up Fast Refresh](https://developer.amazon.com/docs/vega/latest/fast-refresh.html) for configuration.

## Tech Stack

|              | Vega (Fire TV)                                     |
| ------------ | -------------------------------------------------- |
| Framework    | Kepler (@amazon-devices/react-native-kepler 4.0.0) |
| React        | 19.2.0                                             |
| React Native | 0.83.0                                             |
| TypeScript   | 5.8.3                                              |
| Media        | @amazon-devices/react-native-w3cmedia ~2.3.2       |

The shared package (`@multitv/shared`) provides:

- Design tokens sized for 1920x1080 with `scaleWidth` / `scaleHeight` / `scaleFontSize` helpers
- Focus-first TV components: `FocusCard` (always-present 8 px ring, colour-only change), `Chip`, `Shelf`, `InfoTile`, `StateView`
- `CoverArt`, which draws cover art from a seed colour — Vega has no `linear-gradient`, so gradients are eight stacked `View` bands
- A fetch-based MCP/HTTP client and AsyncStorage-backed resume state

## Notes

- The app id is `earth.globie.tv.main`; the package id is `earth.globie.tv`.
- Media playback requires the `[[needs.module]] /com.amazon.kepler.w3cmedia_2@IW3cmedia_3` entry in `manifest.toml` in addition to the autolinked npm package.
- Jest for the Vega workspace maps `react-native` to `@amazon-devices/react-native-kepler`, whose `jest/setup.js` installs the `NativeDeviceInfo` mock that `Dimensions.get('window')` needs.

## Troubleshooting

### Metro Dependency Resolution

If Metro fails to resolve dependencies, check that `watchFolders` and `nodeModulesPaths` are correctly configured in the Metro config. The monorepo uses `react-native-monorepo-tools` to handle this.

### Vega Build Issues

Make sure the Vega CLI tools are installed and configured correctly.
See [Vega CLI Installation](https://developer.amazon.com/docs/vega/latest/install-vega-sdk.html).

### Fast Refresh Not Working

Fast Refresh only works with debug builds:

- `vega_aarch64.vpkg` from `aarch64-debug/` for M-series Mac
- `vega_x86_64.vpkg` from `x86_64-debug/` for Intel Mac
- `vega_armv7.vpkg` from `armv7-debug/` for Fire TV Stick

## Related Resources

- [React Native Documentation](https://reactnative.dev/)
- [Vega Developer Portal](https://developer.amazon.com/docs/vega/vega.html)
- [Globie Earth MCP](https://mcp.globie.earth/mcp)
- [Yarn Workspaces](https://yarnpkg.com/features/workspaces)

## License

See [LICENSE](LICENSE) file.
