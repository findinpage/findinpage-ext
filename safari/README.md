# Find in Page for Safari

This directory contains the macOS container app and Safari Web Extension
wrapper for Find in Page. The Xcode project is generated from `project.yml`
with XcodeGen.

The macOS Safari extension is publicly available as a
[TestFlight beta](https://testflight.apple.com/join/vJPBktr6). It is not an App
Store release, and this macOS target does not indicate iPhone or iPad support.
The instructions below remain available for local development and testing.

## Requirements

- macOS 13 or later with Xcode
- XcodeGen 2.38.0 or later
- Node.js 20 or later
- pnpm
- An Apple Development team for a signed, runnable build

Install the JavaScript dependencies from the extension repository root:

```bash
pnpm install
```

## Generate the Xcode project

The generated `Find in Page.xcodeproj` is ignored by Git. Regenerate it after
changing `project.yml` or cloning the repository:

```bash
pnpm xcode:generate
```

To configure signing, export the Apple team ID before generating the project:

```bash
export DEVELOPMENT_TEAM=YOUR_TEAM_ID
pnpm xcode:generate
```

Alternatively, copy `safari/.env.example` to `safari/.env`, fill in the value,
and load it into the shell before generating:

```bash
set -a
. safari/.env
set +a
pnpm xcode:generate
```

The `.env` file is local-only and must not be committed.

## Build

Open `safari/Find in Page.xcodeproj`, select the **Find in Page (macOS)**
scheme, choose **My Mac**, and build or run the app. The Safari Extension target
automatically runs `pnpm build:safari` and copies the generated Safari MV2
bundle from `.output/safari-mv2` into the `.appex`; no separate WXT build is
required.

For a command-line build without signing:

```bash
xcodebuild \
  -project "safari/Find in Page.xcodeproj" \
  -scheme "Find in Page (macOS)" \
  -configuration Debug \
  CODE_SIGNING_ALLOWED=NO \
  build
```

An unsigned build verifies compilation and packaging but cannot be used as an
installed Safari extension. For a runnable build, configure the same Apple team
for both the app and extension targets and build normally from Xcode.

The XcodeGen configuration sets `ITSAppUsesNonExemptEncryption` to `NO` for
both bundles. This declares that the app does not use non-exempt encryption, so
App Store Connect can determine export-compliance status from the uploaded
build instead of repeatedly showing the missing export-compliance prompt. Keep
this declaration only while the app and extension do not add restricted or
non-exempt cryptography.

## Enable and use locally

1. Run the signed **Find in Page** container app once.
2. Open Safari Settings and select **Extensions**.
3. Enable **Find in Page: See Every Match** and grant website access when Safari
   asks.
4. Open a regular HTTP or HTTPS page and use `Command+F` to open Find in Page.

Safari internal pages and other protected browser UI cannot be accessed by the
extension.

## Xcode Cloud

Xcode Cloud discovers custom scripts only from the repository-root
`ci_scripts/` directory. Those files are intentionally small entry points that
delegate to the implementations in `safari/ci_scripts/`. When the build image
does not provide Node.js, the post-clone script downloads the pinned official
Node.js distribution for the current Mac architecture. It installs the pinned
pnpm version into the ignored `.xcode-cloud/` directory, installs JavaScript
dependencies with the committed lockfile, and generates
`safari/Find in Page.xcodeproj` before Xcode Cloud starts the build. The
workflow does not require Node.js or pnpm to be preinstalled.

## Directory layout

```text
safari/
  project.yml                 XcodeGen source of truth
  ci_scripts/                 Xcode Cloud script implementations
  Shared (App)/               Container app shared code and resources
  Shared (Extension)/         Safari extension native handler
  macOS (App)/                macOS app entry point and Info.plist
  macOS (Extension)/          macOS extension Info.plist
  Find in Page.xcodeproj/     Generated locally; ignored by Git
```
