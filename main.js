"use strict";

import { IPSPatch } from './lib/ips_patch.js';

export { apply, create, parse };

function apply (target, patch) {
  return applyBatch(target, [patch]);
}

function applyBatch (target, patches) {
  for (const ips of patches) {
    const ips_patch = new IPSPatch(
      ips.buffer,
      ips.byteOffset,
      ips.byteLength
    );

    ips_patch.apply(target);
  }

  return target;
}

function create (original, modified) {
  const array_buffer = IPSPatch.from(original, modified).toBuffer();
  return new Uint8Array(array_buffer);
}

async function parse (ips) {
 const patch = new IPSPatch(
   ips.buffer,
   ips.byteOffset,
   ips.byteLength
 );

 return patch.chunks.map(c => {
   return {
     start: c.start.toString(16),
     end: c.end.toString(16),
     rle: c.rle && c.rle.toString(16)
   };
 });
}
