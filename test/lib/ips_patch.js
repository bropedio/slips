"use strict";
/* global require, Buffer */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Diff, IPSPatch } from '../../lib/ips_patch.js';
import { PATCH, EOF, eof } from '../../lib/constants.js';

function to_buffer (from) {
  if (from instanceof Buffer) return from;
  if (typeof from === 'string') from = [from];

  return Buffer.from((from || []).map(x => {
    if (typeof x === 'number') return x;
    return Array.from(x).map(x => x.charCodeAt(0));
  }).flat());
}

function to_diffs (expected) {
  if (typeof expected[0] === 'number') {
    expected = [expected];
  }
  return expected.map(args => {
    const rle = args[2] == null ? null
      : typeof args[2] === 'number' ? args[2]
      : args[2].charCodeAt(0);
    const diff = new Diff(args[0], args[1], rle);
    return diff;
  });
}

/* Tests */

function assert_split (str, expected) {
  return assert_chunks('', str, expected);
}
function assert_chunks (str1, str2, expected) {
  const original = to_buffer(str1);
  const modified = to_buffer(str2);
  const chunks = IPSPatch.chunkify(original, modified);
  return assert.deepEqual(chunks, to_diffs(expected));
}

describe('chunkify 100% diff', () => {
  it('ignores short rle (length <= 3)', () => {
    assert_split('AzzzD', [0, 5]);
  });

  it('identifies minimum rle (length == 4)', () => {
    assert_split('zzzz', [
      [0, 4, 'z']
    ]);
  });

  it('omits short RLE between REGs', () => {
    assert_split('AggggB', [0, 6]);
  });

  it('omits short RLE before REG', () => {
    assert_split('ggggB', [0, 5]);
  });

  it('omits short RLE after REG', () => {
    assert_split('Bgggg', [0, 5]);
  });

  it('omits short RLE pair between REGs', () => {
    assert_split('AggggzzzzB', [0, 10]);
  });

  it('omits short RLE pair before REG', () => {
    assert_split('ggggzzzzB', [0, 9]);
  });

  it('omits short RLE pair after REG', () => {
    assert_split('Aggggzzzz', [0, 9]);
  });

  it('omits short RLE between REG and RLE', () => {
    assert_split('Aggggggggzzzzzzzzz', [
      [0, 9],
      [9, 18, 'z']
    ]);
  });

  it('omits short RLE between RLE and REG', () => {
    assert_split('zzzzzzzzzggggggggA', [
      [0, 9, 'z'],
      [9, 18]
    ]);
  });

  it('keeps long RLE between two REGs', () => {
    assert_split('AggggggggggggggB', [
      [0, 1],
      [1, 15, 'g'],
      [15, 16]
    ]);
  });

  it('keeps long RLE before REG', () => {
    assert_split('gggggggggB', [
      [0, 9, 'g'],
      [9, 10]
    ]);
  });

  it('keeps long RLE after REG', () => {
    assert_split('Bggggggggg', [
      [0, 1],
      [1, 10, 'g']
    ]);
  });

  it('keeps long RLE pair between REGs', () => {
    assert_split('AgggggggggzzzzzzzzzzzzzB', [
      [0, 1],
      [1, 10, 'g'],
      [10, 23, 'z'],
      [23, 24]
    ]);
  });

  it('keeps long RLE pair before REG', () => {
    assert_split('ggggzzzzzzzzzzzzzB', [
      [0, 4, 'g'],
      [4, 17, 'z'],
      [17, 18]
    ]);
  });

  it('keeps long RLE pair after REG', () => {
    assert_split('Azzzzzzzzzzzzzgggg', [
      [0, 1],
      [1, 14, 'z'],
      [14, 18, 'g']
    ]);
  });

  it('handles length overflow', async (sub) => {
    const source = Buffer.alloc(0x20000);

    await sub.test('handles rle length overflow', () => {
      assert_split(source, [
        [0, 0xFFFF, 0],
        [0xFFFF, 0x1FFFE, 0],
        [0x1FFFE, 0x20000]
      ]);
    });

    for (let i = 0, l = source.length; i < l; ++i) {
      source[i] = i;
    }

    await sub.test('handles reg length overflow', () => {
      assert_split(source, [
        [0, 0xFFFF],
        [0xFFFF, 0x1FFFE],
        [0x1FFFE, 0x20000]
      ]);
    });
  });

  it('handles EOF offset', () => {
    const original = Buffer.alloc(eof + 1); // all zeroes
    const modified = Buffer.from(original);
    modified[eof] = 1; // now, all zeros, then 1 at EOF
     
    // Last diff will be converted to REG to include final offset
    assert_chunks(original, modified, [
      [eof - 1, modified.length]
    ]);
  });
});

describe('create', () => {
  function assert_ips (original, modified, expected, expected_footer) {
    original = to_buffer(original);
    modified = to_buffer(modified);

    const ips_patch = IPSPatch.from(original, modified);

    return assert.deepEqual(
      Buffer.from(ips_patch.toBuffer()),
      Buffer.concat([
        PATCH,
        to_buffer(expected),
        EOF,
        to_buffer(expected_footer)
      ])
    );
  }

  it('creates simple IPS patch', () => {
    assert_ips('abc', 'aac', [
      0, 0, 1,
      0, 1,
      'a'
    ]);
  });

  it('creates truncated IPS patch', () => {
    assert_ips('abc', 'aa', [
      0, 0, 1,
      0, 1,
      'a'
    ], [
      0, 0, 2
    ]);
  });

  it('creates IPS patch with RLE and REG', () => {
    assert_ips('abcdef', 'abcZZZZZZZZZdef', [
      0, 0, 3,
      0, 0,
      0, 9,
      'Z',
      0, 0, 12,
      0, 3,
      'def'
    ]);
  });
});

