#!/usr/bin/env node

/* global console */

import { promises as fs } from "node:fs";
import { parseArgs } from "node:util";
import * as slips from "./main.js";

const { positionals } = parseArgs({ allowPositionals: true });
const [ action, ...args ] = positionals;

async function main () {
  await actions[action](...args);
  console.log("Finished");
}

const actions = {
  apply: async (input, output, ...ips_paths) => {
    const target = await fs.readFile(input);
    const applyPatch = slips.apply.bind(null, target);

    await Promise.all(ips_paths.map(path => {
      return fs.readFile(path).then(applyPatch);
    }));

    return fs.writeFile(output, target);
  },

  create: async (output, original_path, modified_path) => {
    const [original, modified] = await Promise.all([
      fs.readFile(original_path),
      fs.readFile(modified_path)
    ]);
    const ips = slips.create(original, modified);
    return fs.writeFile(output, ips);
  },

  parse: async (ips_path) => {
    const ips = fs.readFile(ips_path);
    const chunks = slips.parse(ips);
    console.log(JSON.stringify(chunks, null, 4));
  }
};

main();

