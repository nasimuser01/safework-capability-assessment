import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rules, firstError } from '../script.js';

describe('firstError – message ordering', () => {
  it('returns null for a valid value', () => {
    assert.equal(firstError(rules.abn, '51 824 753 556'), null);
  });

  it('reports "required" before "format" for an empty value', () => {
    assert.equal(firstError(rules.abn, ''), 'Enter your ABN');
  });

  it('reports "format" before "checksum" for a malformed value', () => {
    assert.match(firstError(rules.abn, '12345'), /11 digits/);
  });

  it('reports "checksum" for a well-formed but invalid ABN', () => {
    assert.match(firstError(rules.abn, '51 824 753 557'), /not valid/);
  });

  it('treats optional fields as valid when empty', () => {
    assert.equal(firstError(rules.phone, ''), null);
    assert.equal(firstError(rules.phone, '   '), null);
  });

  it('still validates optional fields when filled', () => {
    assert.match(firstError(rules.phone, '123'), /Australian phone number/);
  });

  it('validates file rules in order: missing, type, size', () => {
    assert.match(firstError(rules['policy-file'], undefined), /Attach a copy/);
    assert.match(firstError(rules['policy-file'], { name: 'x.exe', size: 1 }), /PDF or Word/);
    assert.match(firstError(rules['policy-file'], { name: 'x.pdf', size: 9e9 }), /5 MB/);
    assert.equal(firstError(rules['policy-file'], { name: 'x.pdf', size: 1 }), null);
  });
});
