#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { GBL_APPLICATION_TYPE, GBL_TYPE, GeckoBootloaderImage } from 'gbl-tools';

// Data printing helper functions
function intToHex(n, c = 8) {
  return n.toString(16).toUpperCase().padStart(c, '0');
}

function bootloaderVersion(v) {
  return `${v.major}.${v.minor} (Customer 0x${intToHex(v.customer, 4)})`;
}

function bytesToHex(bytes, truncateAt = 64) {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return truncateAt && hex.length > truncateAt ? `${hex.slice(0, truncateAt)}...` : hex;
}

function flagString(flags, source) {
  return (
    Object.keys(source)
      .filter((key) => flags & source[key])
      .join(', ') || 'None'
  );
}

// Check for required command line arguments
if (process.argv.length < 3) {
  console.error('Usage: gbl-parser <path to GBL file>');
  process.exit(1);
}

// Read a GBL file into a buffer
let buffer;
const filePath = process.argv[2];
try {
  buffer = await readFile(filePath);
} catch (error) {
  if (error.code === 'ENOENT') {
    console.error(`${filePath}: No such file or directory`);
  } else {
    console.error(`Error reading file ${filePath}:`, error.message || error);
  }
  process.exit(1);
}

// Parse the GBL image
const image = new GeckoBootloaderImage(buffer.buffer);

// Check for required tags and validate the gbl against the embedded CRC32
if (!image.isValid()) {
  console.error('Invalid GBL image');
  process.exit(1);
}

console.log('Found valid GBL image!');
console.log(`  Encrypted:           ${image.header.typeFlags & GBL_TYPE.ENCRYPTION_AESCCM ? 'Yes' : 'No'}`);
console.log(`  Signed:              ${image.header.typeFlags & GBL_TYPE.SIGNATURE_ECDSA ? 'Yes' : 'No'}`);
console.log();

if (image.bootloader) {
  console.log('Bootloader:');
  console.log(`  Bootloader Version:  ${bootloaderVersion(image.bootloader.bootloaderVersion)}`);
  console.log(`  Address:             0x${intToHex(image.bootloader.address)}`);
  console.log(`  Data:                ${image.bootloader.data.length} bytes`);
  console.log();
}

if (image.application) {
  console.log('Application:');
  console.log(`  Type:                ${flagString(image.application.type, GBL_APPLICATION_TYPE)}`);
  console.log(`  Version:             0x${intToHex(image.application.version)}`);
  console.log(`  Capabilities:        0x${intToHex(image.application.capabilities)}`);
  console.log(`  Product ID:          0x${bytesToHex(image.application.productId)}`);
  console.log();
}

for (const prog of image.prog) {
  console.log('Program data:');
  console.log(`  Flash Start Address: 0x${intToHex(prog.flashStartAddress)}`);
  console.log(`  Size:                ${prog.data.length} bytes`);
  console.log(`  Compression:         ${prog.compression ?? 'None'}`);
  console.log();
}

for (const metadata of image.metadata) {
  console.log('Metadata:');
  console.log(`  Data:                0x${bytesToHex(metadata)} (${metadata.length} bytes)`);
  console.log();
}

if (image.encryptionInit) {
  console.log('Encryption Init:');
  console.log(`  Message Length:      ${image.encryptionInit.msgLen}`);
  console.log(`  Nonce:               0x${bytesToHex(image.encryptionInit.nonce)}`);
  console.log();
}

for (const encryptionData of image.encryptionData) {
  console.log('Encryption Data:');
  console.log(`  Size:                ${encryptionData.length} bytes`);
  console.log();
}

if (image.signature) {
  console.log('Signature:');
  console.log(`  r:                   0x${bytesToHex(image.signature.r)}`);
  console.log(`  s:                   0x${bytesToHex(image.signature.s)}`);
  console.log();
}

if (image.seUpgrade) {
  console.log('Secure Element Upgrade:');
  console.log(`  Blob Size:           ${image.seUpgrade.blobSize} bytes`);
  console.log(`  Version:             0x${intToHex(image.seUpgrade.version)}`);
  console.log(`  Data:                ${image.seUpgrade.data.length} bytes`);
  console.log();
}
