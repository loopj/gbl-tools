/**
 * Gecko Bootloader BLE OTA Client
 *
 * Web Bluetooth implementation of the Gecko Bootloader OTA protocol.
 *
 * Protocol documentation:
 * https://docs.silabs.com/bluetooth/latest/using-gecko-bootloader-with-bluetooth-apps/03-bluetooth-ota-upgrade
 */

/** GBL OTA Service UUID */
export const GBL_OTA_SERVICE_UUID = '1d14d6ee-fd63-4fa1-bfa4-8f47b42119f0';

// Characteristic UUIDs
const OTA_CONTROL_UUID = 'f7bf3564-fb6d-4e53-88a4-5e37e0326063';
const OTA_DATA_UUID = '984227f3-34fc-4045-a5d0-2c581f81a153';
const APPLOADER_VERSION_UUID = '4f4a2368-8cca-451e-bfff-cf0e2ee23e9f';
const OTA_VERSION_UUID = '4cc07bcf-0868-4b32-9dad-ba4cc41e5316';
const GECKO_BOOTLOADER_VERSION_UUID = '25f05c0a-e917-46e9-b2a5-aa2be1245afe';
const APPLICATION_VERSION_UUID = '0d77cc11-4ac1-49f2-bfa9-cd96ac7a92f8';

/**
 * Commands for the OTA control characteristic
 * @enum {number}
 */
export const GBL_OTA_COMMAND = {
  /** Start the OTA upgrade process */
  START_OTA: 0x00,

  /** Mark the upload as finished after uploading all data */
  FINISH_OTA: 0x03,

  /** Request the target device to close the connection */
  CLOSE_CONNECTION: 0x04,
};

/**
 * Gecko Bootloader Client
 */
export class GeckoBootloaderClient {
  #device;

  #otaControlChar;
  #otaDataChar;
  #appLoaderVersionChar;
  #otaVersionChar;
  #geckoBootloaderVersionChar;
  #applicationVersionChar;

  /**
   * Create an instance of the GeckoBootloaderClient class.
   * @param {BluetoothDevice} device - The Bluetooth device to connect to.
   */
  constructor(device) {
    this.#device = device;
  }

  /**
   * Connect to the GATT server and sets up characteristics.
   * @param {Object} options - Connection options.
   * @param {number} options.timeout - Connection timeout in milliseconds.
   * @throws {Error} If the connection times out or fails.
   * @returns {Promise<void>}
   */
  async connect({ timeout = 15000 } = {}) {
    // Connect to the GATT server
    await Promise.race([
      this.#device.gatt.connect(),

      new Promise((_resolve, reject) =>
        setTimeout(() => {
          const error = new Error('Connection timed out');
          error.name = 'TimeoutError';
          error.code = 'ETIMEDOUT';
          reject(error);
        }, timeout),
      ),
    ]);

    // Set up characteristics
    const service = await this.#device.gatt.getPrimaryService(GBL_OTA_SERVICE_UUID);
    this.#otaControlChar = await service.getCharacteristic(OTA_CONTROL_UUID);
    this.#otaDataChar = await service.getCharacteristic(OTA_DATA_UUID);
    this.#appLoaderVersionChar = await service.getCharacteristic(APPLOADER_VERSION_UUID);
    this.#otaVersionChar = await service.getCharacteristic(OTA_VERSION_UUID);
    this.#geckoBootloaderVersionChar = await service.getCharacteristic(GECKO_BOOTLOADER_VERSION_UUID);
    this.#applicationVersionChar = await service.getCharacteristic(APPLICATION_VERSION_UUID);
  }

  /**
   * Disconnect from the GATT server.
   */
  disconnect() {
    this.#device.gatt.disconnect();
  }

  /**
   * Check if the client is connected to the GATT server.
   * @returns {boolean} True if connected, false otherwise.
   */
  get connected() {
    return this.#device.gatt.connected ?? false;
  }

  /**
   * Add a disconnect handler.
   * @param {Function} handler - The disconnect handler function.
   */
  addDisconnectHandler(handler) {
    this.#device.addEventListener('gattserverdisconnected', handler);
  }

  /**
   * Remove a disconnect handler.
   * @param {Function} handler - The disconnect handler function.
   */
  removeDisconnectHandler(handler) {
    this.#device.removeEventListener('gattserverdisconnected', handler);
  }

  /**
   * Send a command to the OTA control characteristic.
   * @param {number} command - The command to send, see {@link GBL_OTA_COMMAND}.
   * @returns {Promise<void>}
   */
  async otaControl(command) {
    await this.#otaControlChar.writeValueWithResponse(Uint8Array.of(command));
  }

  /**
   * Flashes a complete firmware image to the device.
   * @param {ArrayBuffer} data - The firmware data to upload.
   * @param {Object} options - Upload options.
   * @param {boolean} [options.reliable=false] - Whether to use reliable mode, i.e. wait for an acknowledgment after each chunk.
   * @param {number} [options.wait=10] - Wait time between chunks in milliseconds when not using reliable mode.
   * @param {number} [options.chunkSize=64] - Size of each chunk in bytes, maximum is 244 bytes.
   * @param {Function} [options.progress] - Progress callback function.
   * @param {AbortSignal} [options.signal] - Abort signal to cancel the upload.
   * @throws {DOMException} with name 'AbortError' if the upload is aborted.
   * @returns {Promise<void>}
   */
  async flashFirmware(data, { reliable = false, wait = 10, chunkSize = 64, progress, signal } = {}) {
    // Handle abort signal
    signal?.throwIfAborted();

    // Start the OTA process
    await this.otaControl(GBL_OTA_COMMAND.START_OTA);

    // Write the firmware in chunks
    const total = data.byteLength;
    for (let start = 0; start < total; start += chunkSize) {
      // Handle abort signal
      signal?.throwIfAborted();

      // Grab the next chunk
      const chunk = data.slice(start, start + chunkSize);

      // Write the chunk
      if (reliable) {
        await this.#otaDataChar.writeValueWithResponse(chunk);
      } else {
        await this.#otaDataChar.writeValueWithoutResponse(chunk);
        await new Promise((r) => setTimeout(r, wait));
      }

      // Update progress
      progress?.((start / total) * 100);
    }

    // Handle abort signal
    signal?.throwIfAborted();

    // Finish the OTA process
    await this.otaControl(GBL_OTA_COMMAND.FINISH_OTA);

    // Always report 100% progress at the end
    progress?.(100);
  }

  /**
   * Get the OTA protocol version.
   * @returns {Promise<number>} The OTA protocol version.
   */
  async getOtaVersion() {
    return (await this.#otaVersionChar.readValue()).getUint8(0);
  }

  /**
   * Get the AppLoader version.
   * @returns {Promise<{major: number, minor: number, patch: number, build: number}>} The AppLoader version.
   */
  async getAppLoaderVersion() {
    const version = await this.#appLoaderVersionChar.readValue();
    return {
      major: version.getUint16(0, true),
      minor: version.getUint16(2, true),
      patch: version.getUint16(4, true),
      build: version.getUint16(6, true),
    };
  }

  /**
   * Get the Gecko Bootloader version.
   * @returns {Promise<{major: number, minor: number, customer: number}>} The Gecko Bootloader version.
   */
  async getGeckoBootloaderVersion() {
    const version = await this.#geckoBootloaderVersionChar.readValue();
    return {
      major: version.getUint8(3),
      minor: version.getUint8(2),
      customer: version.getUint16(0, true),
    };
  }

  /**
   * Get the application version.
   * @returns {Promise<number>} The application version.
   */
  async getApplicationVersion() {
    return (await this.#applicationVersionChar.readValue()).getUint32(0, true);
  }
}
