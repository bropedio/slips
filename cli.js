#!/usr/bin/env node

import { promises as fs } from "node:fs";
import { parseArgs } from "node:util";
import { IPSPatch } from "./lib/ips_patch.js";

const { positionals } = parseArgs({ allowPositionals: true });
const [ action, ...args ] = positionals;

async function main () {
  await actions[action](...args);
  console.log("Finished");
}

const actions = {
  apply: async (input, output, ...ips_paths) => {
    let target = await fs.readFile(input);

    await Promise.all(ips_paths.map(path => {
      return fs.readFile(path).then(ips => {
        const ips_patch = new IPSPatch(
          ips.buffer,
          ips.byteOffset,
          ips.byteLength
        );

        target = ips_patch.apply(target);
      });
    }));

    return fs.writeFile(output, target);
  },
  create: async (output, original_path, modified_path) => {
    const [original, modified] = await Promise.all([
      fs.readFile(original_path),
      fs.readFile(modified_path)
    ]);
    const ips = IPSPatch.from(original, modified);
    return fs.writeFile(output, Buffer.from(ips.toBuffer()));
  },
  parse: async (ips_path) => {
    return fs.readFile(ips_path).then(ips => {
      const patch = new IPSPatch(ips.buffer, ips.byteOffset, ips.byteLength);
      console.log(JSON.stringify(patch.chunks.map(c => {
        return {
          start: c.start.toString(16),
          end: c.end.toString(16),
          rle: c.rle && c.rle.toString(16)
        }; 
      }), null, 4));
    });
  }
};

main();

