import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validators, MAX_FILE_BYTES } from '../script.js';

// Small helper so each table reads as data, not boilerplate.
const check = (fn, cases) => {
  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} -> ${expected}`, () => {
      assert.equal(fn(input), expected);
    });
  }
};

describe('required', () => {
  check(validators.required, [
    ['Jane Citizen', true],
    ['a', true],
    ['', false],
    ['   ', false],
    ['\t\n', false],
    [undefined, false],
  ]);
});

describe('auPhone', () => {
  check(validators.auPhone, [
    // Mobiles
    ['0412345678', true],
    ['0412 345 678', true],
    ['0412-345-678', true],
    ['+61 412 345 678', true],
    ['+61412345678', true],
    ['61412345678', true],
    ['0512 345 678', true],
    // Landlines
    ['02 9876 5432', true],
    ['(02) 9876 5432', true],
    ['(02)98765432', true],
    ['03 9876 5432', true],
    ['07 3876 5432', true],
    ['08 9876 5432', true],
    ['+61 2 9876 5432', true],
    // 13 / 1300 / 1800
    ['13 10 50', true],
    ['1300 123 456', true],
    ['1800 123 456', true],
    // Invalid
    ['', false],
    ['0412 345 67', false],       // too short
    ['0412 345 6789', false],     // too long
    ['0112 345 678', false],      // 01 is not a valid area/mobile prefix
    ['06 9876 5432', false],      // 06 unused
    ['09 9876 5432', false],      // 09 unused
    ['1200 123 456', false],      // not 1300/1800
    ['+1 212 555 0100', false],   // not Australian
    ['abc', false],
    ['04l2 345 678', false],      // letter l instead of 1
  ]);
});

describe('email', () => {
  check(validators.email, [
    ['jane@example.com', true],
    ['jane.citizen@example.com.au', true],
    ['jane+tag@sub.example.gov.au', true],
    ["o'brien@example.com", true],
    ['JANE@EXAMPLE.COM', true],
    ['  jane@example.com  ', true], // trimmed
    ['', false],
    ['jane', false],
    ['jane@', false],
    ['@example.com', false],
    ['jane@example', false],        // no TLD
    ['jane@example.c', false],      // TLD too short
    ['jane@-example.com', false],   // label cannot start with hyphen
    ['jane@example-.com', false],   // label cannot end with hyphen
    ['jane@exam ple.com', false],   // space
    ['jane@@example.com', false],
    ['jane@example..com', false],   // empty label
  ]);
});

describe('abnFormat', () => {
  check(validators.abnFormat, [
    ['51824753556', true],
    ['51 824 753 556', true],
    ['  51 824 753 556  ', true],
    ['', false],
    ['5182475355', false],          // 10 digits
    ['518247535567', false],        // 12 digits
    ['01 824 753 556', false],      // leading zero
    ['51-824-753-556', false],      // hyphens are not ATO formatting
    ['51  824 753 556', false],     // double space
    ['518 24 753 556', false],      // wrong grouping
    ['51 824 753 55A', false],
  ]);
});

describe('abnChecksum', () => {
  check(validators.abnChecksum, [
    ['51 824 753 556', true],       // ATO's published example
    ['51824753556', true],
    ['53 004 085 616', true],       // another known-valid ABN
    ['51 824 753 557', false],      // last digit changed
    ['15 824 753 556', false],      // first two digits swapped
    ['11 111 111 111', false],
    ['00 000 000 000', false],
    ['', false],
    ['123', false],
  ]);
});

describe('policyFileType', () => {
  check(validators.policyFileType, [
    [{ name: 'policy.pdf', size: 1 }, true],
    [{ name: 'policy.PDF', size: 1 }, true],
    [{ name: 'policy.doc', size: 1 }, true],
    [{ name: 'policy.docx', size: 1 }, true],
    [{ name: 'my policy (2026).docx', size: 1 }, true],
    [{ name: 'policy.pdf.exe', size: 1 }, false], // double extension
    [{ name: 'policy.txt', size: 1 }, false],
    [{ name: 'policy.jpg', size: 1 }, false],
    [{ name: 'policy', size: 1 }, false],
    [{ name: 'policydocx', size: 1 }, false],     // no dot
    [null, false],
    [undefined, false],
  ]);
});

describe('policyFileSize', () => {
  check(validators.policyFileSize, [
    [{ name: 'a.pdf', size: 0 }, true],
    [{ name: 'a.pdf', size: MAX_FILE_BYTES }, true],
    [{ name: 'a.pdf', size: MAX_FILE_BYTES + 1 }, false],
    [null, false],
  ]);
});
