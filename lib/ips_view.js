"use strict";

class IPSView extends DataView {
  constructor (...args) {
    super(...args);
    this._index = 0;
  }
  get remaining () {
    return this.byteLength - this._index;
  }
  readUint8 () {
    const uint8 = this.getUint8(this._index);
    this._index += 1;
    return uint8;
  }
  readUint16 () {
    const uint16 = this.getUint16(this._index);
    this._index += 2;
    return uint16;
  }
  readUint24 () {
    return (this.readUint8() << 16) + this.readUint16();
  }
  writeUint8 (value) {
    this.setUint8(this._index, value);
    this._index += 1;
  }
  writeUint16 (value) {
    this.setUint16(this._index, value);
    this._index += 2;
  }
  writeUint24 (value) {
    this.writeUint8(value >> 16);
    this.writeUint16(value & 0xFFFF);
  }
  write (source, source_offset=0, source_length=source.length) {
    for (let i = 0, l = source_length; i < l; ++i) {
      this.writeUint8(source[source_offset + i]);
    }
  }
  compare (buffer) {
    for (let i = 0, l = buffer.length; i < l; ++i) {
      if (this.readUint8() !== buffer[i]) {
        return false;
      }
    }

    return true;
  }
}

export { IPSView };
