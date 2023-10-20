"use strict";

import { IPSView } from './ips_view.js';
import { PATCH, EOF, eof } from './constants.js';

class Diff {
  constructor (start, end, rle=null) {
    this.start = start;
    this.end = end;
    this.rle = rle;
  }

  get length () { return this.end - this.start; }
  get size () { return this.rle != null ? 8 : 5 + this.length; }
}

class RLEBlock {
  constructor (all_chunks) {
    // TODO: Not a great relationship
    this.all_chunks = all_chunks;
    this.chunks = [];
  }
  get size () {
    return this.chunks.reduce((size, diff) => size + diff.size, 0);
  }
  add (start, end, rle) {
    this.chunks.push(new Diff(start, end, rle));
  }
  save () {
    this.all_chunks.push(...this.chunks);
  }
}

class REGBlock extends RLEBlock {
  constructor (all_chunks) {
    super(all_chunks);

    const last_chunk = all_chunks[all_chunks.length - 1];
    if (last_chunk && last_chunk.rle == null) {
      this.chunks.push(new Diff(last_chunk.start, last_chunk.end));
    }

    this.init_size = super.size;
  }
  get current () {
    return this.chunks[this.chunks.length - 1];
  }
  get size () {
    return super.size - this.init_size;
  }
  safe_add (start, end) {
    const safe_start = start === eof ? start - 1 : start;
    this.chunks.push(new Diff(safe_start, end));
  }
  add (start, end) {
    if (!this.current) {
      this.safe_add(start, start);
    }

    const wide_gap = start - this.current.end > 5;
    const overflow_inside_gap = start - this.current.start > 0xFFFF;

    if (wide_gap || overflow_inside_gap) {
      this.safe_add(start, start);
    }

    // Extend current REG diff
    this.current.end = end;

    // Handle length overflow
    while (this.current.length > 0xFFFF) {
      this.current.end = this.current.start + 0xFFFF;
      this.safe_add(this.current.end, end);
    }
  }
  save () {
    if (this.init_size) {
      this.all_chunks[this.all_chunks.length - 1] = this.chunks.shift();
    }
    super.save();
  }
}

class IPSPatch {
  constructor (input) {
    if (!input.chunks) {
      input = IPSPatch.parse(input);
    }

    this.chunks = input.chunks;
    this.truncate = input.truncate;
    this.data = input.data;
  }

  static from (original, modified) {
    const chunks = IPSPatch.chunkify(original, modified);
    const truncate = modified.length < original.length && modified.length;
    return new IPSPatch({ chunks, truncate, data: modified });
  }

  apply (target) {
    const minimum_size = Math.max(...this.chunks.map(chunk => chunk.end));

    if (target.length < minimum_size) {
      const larger_target = new Uint8Array(minimum_size);
      larger_target.set(target, 0);
      target = larger_target;
    }

    for (const chunk of this.chunks) {
      if (chunk.rle != null) {
        for (let i = chunk.start; i < chunk.end; ++i) {
          target[i] = chunk.rle;
        }
      } else {
        for (let i = chunk.start; i < chunk.end; ++i) {
          target[i] = this.data[i];
        }
      }
    }

    return target;
  }

  toBuffer () {
    const { chunks, truncate, data } = this;

    const chunk_size = chunks.reduce((len, diff) => len + diff.size, 0);
    const buf_size = 0 +
      PATCH.length +
      chunk_size +
      EOF.length +
      (truncate ? 3 : 0);
  
    const ips_buffer = new ArrayBuffer(buf_size);
    const ips = new IPSView(ips_buffer);
  
    let offset = 0;
  
    ips.write(PATCH);
  
    for (const chunk of chunks) {
      ips.writeUint24(chunk.start);
  
      if (chunk.rle != null) {
        ips.writeUint16(0);
        ips.writeUint16(chunk.length);
        ips.writeUint8(chunk.rle);
      } else {
        ips.writeUint16(chunk.length);
        ips.write(data, chunk.start, chunk.length);
      }
    }
  
    offset = ips.write(EOF);
  
    if (truncate) {
      ips.writeUint24(truncate); 
    }
  
    return ips_buffer;
  }

  static parse (array_buffer, byte_offset, byte_length) {
    const ips = new IPSView(array_buffer, byte_offset, byte_length);

    const chunks = [];
    const data = [];
    let truncate = null;

    if (!ips.compare(PATCH)) {
      throw new Error('Invalid IPS header');
    }

    while (true) {
      const offset = ips.readUint24();

      if (offset === eof) {
        break;
      }
  
      const length = ips.readUint16();
  
      if (length) { // REG
        chunks.push(new Diff(offset, offset + length));
        for (let o = 0; o < length; ++o) {
          data[offset + o] = ips.readUint8();
        }
      } else { // RLE
        const repeat = ips.readUint16();
        const rle = ips.readUint8();
        chunks.push(new Diff(offset, offset + repeat, rle));
      }
    }

    if (ips.remaining === 3) {
      truncate = ips.readUint24();
    }

    if (ips.remaining !== 0) {
      throw new Error('IPS file contains invalid trailing data');
    }

    return { chunks, truncate, data };
  }

  static chunkify (source, target) {
    const chunks = [];
    const length = target.length;

    let offset = 0;
    let rle_block, reg_block;

    reset();

    function reset () {
      rle_block = new RLEBlock(chunks);
      reg_block = new REGBlock(chunks);
    }

    /**
     * Loop through entire target ROM
     *
     * 1. If there is no cost to extend REG to the last queued block,
     *    we should do it, since left-side REG provides more flexibility.
     * 2. If queue cost cannot drop below zero with a right-side REG,
     *    we know the last queued block must be an RLE.
     */
    while (true) {
      const init_offset = offset;

      // Skip ahead to next diff byte
      while (target[offset] === source[offset] && offset < length) {
        ++offset;
      }

      const gap_size = offset - init_offset;
      const end_of_block = gap_size > 5 || offset === length;
      const relative_cost = reg_block.size - rle_block.size;
      const best_block = relative_cost <= 0 ? reg_block
        : relative_cost + gap_size > 5 || end_of_block ? rle_block
        : null;

      if (best_block) {
        best_block.save();
        reset();
      }

      // Exit condition
      if (offset >= length) {
        break;
      }

      // Consider every diff byte a potential RLE
      const rle = target[offset];
      let i = offset;
      let diff_start = offset;
      let gap_start = null;

      if (offset === eof) {
        // Never allow RLE extending from eof offset
        // Could optimize by looking backwards, maybe another time
        ++i;
      } else {
        // Greedily extend RLE to a max of 0xFFFF
        while (i - offset < 0xFFFF && target[++i] === rle) {
          // If we are at a diff byte
          if (rle !== source[i]) {
            // And it's the first diff after a gap
            if (diff_start == null) {
              diff_start = i;
              gap_start = null;
            }
          // If it's the beginning of a new gap
          } else if (diff_start != null) {
            reg_block.add(diff_start, i);
            diff_start = null;
            gap_start = i;
          }
        }
      }

      const rle_end = gap_start || i;
      rle_block.add(offset, rle_end, rle);

      if (!gap_start) {
        reg_block.add(diff_start, rle_end);
      }
      offset = rle_end;
    }

    return chunks;
  }
}

export { Diff, IPSPatch };
