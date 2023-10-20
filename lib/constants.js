"use strict";

const PATCH = string_buffer('PATCH');
const EOF = string_buffer('EOF');
const eof = readUint24BE(EOF);

function string_buffer (string) {
  return new Uint8Array(Array.from(string).map(c => c.charCodeAt()));
}
function readUint24BE (buf, o=0) {
  return (buf[o] << 16) | (buf[o + 1] << 8) | buf[o + 2];
}

export { PATCH, EOF, eof };
