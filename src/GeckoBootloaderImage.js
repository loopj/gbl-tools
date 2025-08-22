/**
 * Gecko Bootloader Image Parser
 *
 * Parses and validates a Gecko Bootloader (GBL) image file.
 *
 * See specifications here:
 * https://docs.silabs.com/mcu-bootloader/latest/bootloader-user-guide-gsdk-4/02-gecko-bootloader-file-format
 */

// GBL format version
const GBL_VERSION = 0x03000000;

// Tag IDs
const GBL_TAG_ID_HEADER_V3 = 0x03a617eb;
const GBL_TAG_ID_BOOTLOADER = 0xf50909f5;
const GBL_TAG_ID_APPLICATION = 0xf40a0af4;
const GBL_TAG_ID_METADATA = 0xf60808f6;
const GBL_TAG_ID_PROG = 0xfe0101fe;
const GBL_TAG_ID_PROG_LZ4 = 0xfd0505fd;
const GBL_TAG_ID_PROG_LZMA = 0xfd0707fd;
const GBL_TAG_ID_ERASEPROG = 0xfd0303fd;
const GBL_TAG_ID_END = 0xfc0404fc;
const GBL_TAG_ID_SE_UPGRADE = 0x5ea617eb;
const GBL_TAG_ID_VERSION_DEPENDENCY = 0x76a617eb;
const GBL_TAG_ID_ENC_INIT = 0xfa0606fa;
const GBL_TAG_ID_ENC_GBL_DATA = 0xf90707f9;
const GBL_TAG_ID_CERTIFICATE = 0xf30b0bf3;
const GBL_TAG_ID_SIGNATURE = 0xf70a0af7;

/**
 * Type flags for the header tag indicating whether the file is encrypted and/or signed
 * @enum {number}
 */
export const GBL_TYPE = {
  ENCRYPTION_AESCCM: 1 << 0,
  SIGNATURE_ECDSA: 1 << 8,
};

/**
 * Type flags for the application info tag
 * @enum {number}
 */
export const GBL_APPLICATION_TYPE = {
  ZIGBEE: 1 << 0,
  THREAD: 1 << 1,
  FLEX: 1 << 2,
  BLUETOOTH: 1 << 3,
  MCU: 1 << 4,
  BLUETOOTH_APP: 1 << 5,
  BOOTLOADER: 1 << 6,
  ZWAVE: 1 << 7,
};

/**
 * Gecko Bootloader Image class
 * Parses and validates a Gecko Bootloader (GBL) image file.
 */
export class GeckoBootloaderImage {
  #buffer;
  #dataView;

  /**
   * GBL header tag type.
   * @typedef {Object} GblHeader
   * @property {number} version - GBL format version
   * @property {number} typeFlags - Bitwise OR of {@link GBL_TYPE} values
   */

  /**
   * GBL header.
   * @type {?GblHeader}
   */
  header = null;

  /**
   * GBL bootloader tag type.
   * @typedef {Object} GblBootloader
   * @property {{major: number, minor: number, customer: number}} bootloaderVersion - Version number of the bootloader.
   * @property {number} address - Address of the bootloader.
   * @property {Uint8Array} data - Data for bootloader upgrade.
   */

  /**
   * Bootloader upgrade information and data.
   * @type {?GblBootloader}
   */
  bootloader = null;

  /**
   * @typedef {Object} GblApplication
   * @property {number} type - Bitfield representing type of application, see {@link GBL_APPLICATION_TYPE}.
   * @property {number} version - Version number for this application.
   * @property {number} capabilities - Capabilities of this application.
   * @property {Uint8Array} productId - Unique ID (UUID or GUID) for the product this application is built for.
   */

  /**
   * Application information.
   * @type {?GblApplication}
   */
  application = null;

  /**
   * Array of metadata sections.
   * @type {Uint8Array[]}
   */
  metadata = [];

  /**
   * GBL flash program tag type.
   * @typedef {Object} GblProg
   * @property {number} flashStartAddress - Address to start flashing.
   * @property {Uint8Array} data - Data to flash.
   * @property {"lz4" | "lzma"} [compression] - Compression algorithm used.
   */

  /**
   * Array of flash program sections.
   * @type {GblProg[]}
   */
  prog = [];

  /**
   * GBL SE upgrade tag type.
   * @typedef {Object} GblSeUpgrade
   * @property {number} blobSize - Size of the SE upgrade blob.
   * @property {number} version - Version of the SE image.
   * @property {Uint8Array} data - Data for the SE upgrade.
   */

  /**
   * SE upgrade information and data.
   * @type {GblSeUpgrade?}
   */
  seUpgrade = null;

  /**
   * GBL version dependency tag type.
   * @typedef {Object} VersionDependency
   * @property {number} imageType - Type of image (application, bootloader, SE)
   * @property {number} statement - Encoded dependency statement (ex. appVersion > (0).1.2.3)
   * @property {number} version - The version number used in the statement (ex. (0).1.2.3)
   */

  /**
   * Version dependency information.
   * @type {VersionDependency?}
   */
  versionDependency = null;

  /**
   * GBL encryption init tag type. Used with AES-CCM encryption.
   * @typedef {Object} GblEncryptionInitAesCcm
   * @property {number} msgLen - Length of the cipher text in bytes.
   * @property {Uint8Array} nonce - Random nonce used for AES-CTR in this message.
   */

  /**
   * Encryption initialization data.
   * @type {GblEncryptionInitAesCcm?}
   */
  encryptionInit = null;

  /**
   * Array of encryption data sections.
   * @type {Uint8Array[]}
   */
  encryptionData = [];

  /**
   * GBL ECDSA secp256r1 signature tag type.
   * @typedef {Object} GblSignatureEcdsaP256
   * @property {Uint8Array} r - R-point of ECDSA secp256r1 signature.
   * @property {Uint8Array} s - S-point of ECDSA secp256r1 signature.
   */

  /**
   * Signature information.
   * @type {GblSignatureEcdsaP256?}
   */
  signature = null;

  /**
   * GBL certificate chain for signing.
   * @typedef {Object} GblCertificateEcdsaP256
   * @property {number} structVersion - Version of the certificate structure.
   * @property {Uint8Array} flags - Reserved flags.
   * @property {Uint8Array} key - Public key.
   * @property {number} version - The version number of this certificate.
   * @property {Uint8Array} signature - Signature of the certificate.
   */

  /**
   * Certificate information.
   * @type {GblCertificateEcdsaP256?}
   */
  certificate = null;

  /**
   * CRC32 checksum embedded in the GBL image.
   * @type {number?}
   */
  crc32 = null;

  /**
   * Creates an instance of the GeckoBootloaderImage class.
   * @param {ArrayBuffer} buffer - The GBL image file buffer.
   * @param {boolean} [parse=true] - Whether to parse the buffer immediately.
   */
  constructor(buffer, parse = true) {
    this.#buffer = buffer;
    this.#dataView = new DataView(buffer);

    if (parse) this.parse();
  }

  /**
   * Parses the GBL image file buffer.
   */
  parse() {
    let offset = 0;
    while (offset < this.#buffer.byteLength) {
      // Read tag header
      const tagType = this.#dataView.getUint32(offset, true);
      const tagLength = this.#dataView.getUint32(offset + 4, true);
      offset += 8;

      // Parse tag content
      if (tagType === GBL_TAG_ID_HEADER_V3) {
        this.header = this.#parseHeaderTag(offset, tagLength);
      } else if (tagType === GBL_TAG_ID_BOOTLOADER) {
        this.bootloader = this.#parseBootloaderTag(offset, tagLength);
      } else if (tagType === GBL_TAG_ID_APPLICATION) {
        this.application = this.#parseApplicationInfoTag(offset, tagLength);
      } else if (tagType === GBL_TAG_ID_METADATA) {
        this.metadata.push(this.#parseMetadataTag(offset, tagLength));
      } else if (tagType === GBL_TAG_ID_PROG) {
        this.prog.push(this.#parseProgTag(offset, tagLength));
      } else if (tagType === GBL_TAG_ID_PROG_LZ4) {
        this.prog.push(this.#parseProgTag(offset, tagLength, 'lz4'));
      } else if (tagType === GBL_TAG_ID_PROG_LZMA) {
        this.prog.push(this.#parseProgTag(offset, tagLength, 'lzma'));
      } else if (tagType === GBL_TAG_ID_ERASEPROG) {
        this.prog.push(this.#parseProgTag(offset, tagLength));
      } else if (tagType === GBL_TAG_ID_END) {
        this.crc32 = this.#parseEndTag(offset, tagLength);
      } else if (tagType === GBL_TAG_ID_SE_UPGRADE) {
        this.seUpgrade = this.#parseSeUpgradeTag(offset, tagLength);
      } else if (tagType === GBL_TAG_ID_VERSION_DEPENDENCY) {
        this.versionDependency = this.#parseVersionDependencyTag(offset, tagLength);
      } else if (tagType === GBL_TAG_ID_ENC_INIT) {
        this.encryptionInit = this.#parseEncryptionInitTag(offset, tagLength);
      } else if (tagType === GBL_TAG_ID_ENC_GBL_DATA) {
        this.encryptionData.push(this.#parseEncryptionDataTag(offset, tagLength));
      } else if (tagType === GBL_TAG_ID_SIGNATURE) {
        this.signature = this.#parseSignatureTag(offset, tagLength);
      } else if (tagType === GBL_TAG_ID_CERTIFICATE) {
        this.certificate = this.#parseCertificateTag(offset, tagLength);
      }

      offset += tagLength;
    }
  }

  /**
   * Calculate the CRC32 checksum of the GBL image.
   * @returns {number} The CRC32 checksum.
   */
  calculateCRC32() {
    const buf = new Uint8Array(this.#buffer, 0, this.#buffer.byteLength - 4);
    let crc = 0xffffffff;

    for (let i = 0; i < buf.length; i++) {
      const byte = buf[i];
      crc ^= byte;
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
      }
    }

    return (crc ^ 0xffffffff) >>> 0;
  }

  /**
   * Validates the GBL image by checking the header version and CRC32 checksum.
   * @returns {boolean} True if the GBL image is valid, false otherwise.
   */
  isValid() {
    return this.header.version === GBL_VERSION && this.crc32 === this.calculateCRC32();
  }

  #parseHeaderTag(offset, length) {
    if (length !== 8) throw new Error('Invalid header tag length');

    return {
      version: this.#dataView.getUint32(offset, true),
      typeFlags: this.#dataView.getUint32(offset + 4, true),
    };
  }

  #parseBootloaderTag(offset, length) {
    if (length < 8) throw new Error('Invalid bootloader tag length');

    return {
      bootloaderVersion: {
        major: this.#dataView.getUint8(offset + 3),
        minor: this.#dataView.getUint8(offset + 2),
        customer: this.#dataView.getUint16(offset, true),
      },
      address: this.#dataView.getUint32(offset + 4, true),
      data: new Uint8Array(this.#buffer, offset + 8, length - 8),
    };
  }

  #parseApplicationInfoTag(offset, length) {
    if (length !== 28) throw new Error('Invalid application info tag length');

    return {
      type: this.#dataView.getUint32(offset, true),
      version: this.#dataView.getUint32(offset + 4, true),
      capabilities: this.#dataView.getUint32(offset + 8, true),
      productId: new Uint8Array(this.#buffer, offset + 12, 16),
    };
  }

  #parseMetadataTag(offset, length) {
    return new Uint8Array(this.#buffer, offset, length);
  }

  #parseProgTag(offset, length, compression = undefined) {
    if (length < 4) throw new Error('Invalid program data tag length');

    return {
      flashStartAddress: this.#dataView.getUint32(offset, true),
      data: new Uint8Array(this.#buffer, offset + 4, length - 4),
      compression,
    };
  }

  #parseEndTag(offset, length) {
    if (length !== 4) throw new Error('Invalid end tag length');

    return this.#dataView.getUint32(offset, true);
  }

  #parseSeUpgradeTag(offset, length) {
    if (length < 8) throw new Error('Invalid SE upgrade tag length');

    return {
      blobSize: this.#dataView.getUint32(offset, true),
      version: this.#dataView.getUint32(offset + 4, true),
      data: new Uint8Array(this.#buffer, offset + 8, length - 8),
    };
  }

  #parseVersionDependencyTag(offset, length) {
    if (length !== 8) throw new Error('Invalid version dependency tag length');

    return {
      imageType: this.#dataView.getUint8(offset),
      statement: this.#dataView.getUint8(offset + 1),
      version: this.#dataView.getUint32(offset + 4, true),
    };
  }

  #parseEncryptionInitTag(offset, length) {
    if (length !== 16) throw new Error('Invalid encryption init tag length');

    return {
      msgLen: this.#dataView.getUint32(offset, true),
      nonce: new Uint8Array(this.#buffer, offset + 4, 12),
    };
  }

  #parseEncryptionDataTag(offset, length) {
    return new Uint8Array(this.#buffer, offset, length);
  }

  #parseSignatureTag(offset, length) {
    if (length !== 64) throw new Error('Invalid signature tag length');

    return {
      r: new Uint8Array(this.#buffer, offset, 32),
      s: new Uint8Array(this.#buffer, offset + 32, 32),
    };
  }

  #parseCertificateTag(offset, length) {
    if (length !== 136) throw new Error('Invalid certificate tag length');

    return {
      structVersion: this.#dataView.getUint8(offset),
      flags: new Uint8Array(this.#buffer, offset + 1, 3),
      key: new Uint8Array(this.#buffer, offset + 4, 64),
      version: this.#dataView.getUint32(offset + 68, true),
      signature: new Uint8Array(this.#buffer, offset + 72, 64),
    };
  }
}
