# JavaScript Tools for Gecko Bootloader

This library provides tools for working with the Gecko Bootloader, including parsing GBL images and uploading firmware via the Web Bluetooth API.

## Features

- Pure JavaScript implementation, no dependencies.
- GBL parsing support for both browser and Node.js environments.
- Web Bluetooth client for the Gecko Bootloader BLE OTA protocol.
- Easy-to-use CLI for quick GBL image analysis.

## Parsing Gecko Bootloader (GBL) Images

### Browser

```js
import { GeckoBootloaderImage } from 'gecko-bootloader';

const fileInput = document.getElementById('file-input');
fileInput.addEventListener('change', async (event) => {
  // Read the file as an ArrayBuffer
  const file = event.target.files[0];
  const buffer = await file.arrayBuffer();

  // Parse the GBL image
  const gbl = new GeckoBootloaderImage(buffer);

  // Check image is valid
  const isValid = gbl.isValid();
  console.log(`GBL image validity: ${isValid}`);

  // Print the application version
  const appVersion = gbl.application.version;
  console.log(`Application version: ${appVersion}`);
});
```

### Node.js

```js
import { readFile } from 'node:fs/promises';
import { GeckoBootloaderImage } from 'gecko-bootloader';

// Read a GBL file into a buffer
const buffer = await readFile('myfile.gbl');

// Parse the GBL image
const gbl = new GeckoBootloaderImage(buffer.buffer);

// Check image is valid
const isValid = gbl.isValid();
console.log(`GBL image validity: ${isValid}`);

// Print the application version
const appVersion = gbl.application.version;
console.log(`Application version: ${appVersion}`);
```

### CLI

```bash
npx gbl-tools gbl-parser
```

## Flashing firmware using the Gecko Bootloader BLE OTA protocol

The `GeckoBootloaderClient` class provides methods for interacting with a device running a Gecko Bootloader in AppLoader mode, or an application implementing the Gecko Bootloader OTA protocol, using the [Web Bluetooth API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API).

The Web Bluetooth API has very limited browser compatibility, so check [compatibility tables](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API#browser_compatibility) before use.

### Connecting to a Device

```js
import { GBL_OTA_SERVICE_UUID, GeckoBootloaderClient } from 'gecko-bootloader';

// Prompt user to select a Bluetooth device
let device;
const connectButton = document.getElementById('connect-button');
connectButton.addEventListener('click', async () => {
  device = await navigator.bluetooth.requestDevice({
    filters: [{ services: [GBL_OTA_SERVICE_UUID] }]
  });
});

// Create and connect the client
const client = new GeckoBootloaderClient(device);
await client.connect();

// ...now we can call other methods on the client
```

### Flashing Firmware

```js
// Grab an ArrayBuffer from an HTML file input
const fileInput = document.getElementById('file-input');
const buffer = await fileInput.files[0].arrayBuffer();

// Flash the firmware
await client.flashFirmware(buffer);
```

### Tracking Firmware Flashing Progress

An optional progress callback can be provided, which is called after each chunk of data is uploaded.

```js
function onProgress(progress) {
  console.log(`Upload progress: ${progress}%`);
}

await client.flashFirmware(buffer, { progress: onProgress });
```

### Aborting Firmware Flashing

Flashing can be aborted using the `AbortController` pattern.

```js
const controller = new AbortController();

try {
  await client.flashFirmware(buffer, { signal: controller.signal });
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Upload aborted by user');
  } else {
    console.error('Upload failed:', error);
  }
}

const cancelButton = document.getElementById('cancel-button');
cancelButton.addEventListener('click', () => {
  controller.abort();
});
```

### Fetching Current Firmware Version

```js
// Grab the application version bytes
const versionBytes = await client.getApplicationVersion();

// If using a simple integer versioning scheme
const versionNum = versionBytes.getUint32(0, true);
console.log(`Current firmware version: ${versionNum}`);

// ...or if using semantic versioning
const semver = {
  major: versionBytes.getUint8(3),
  minor: versionBytes.getUint8(2),
  patch: versionBytes.getUint8(1),
  build: versionBytes.getUint8(0)
};
```
