# Simple Little IPS (SLIPS)

This rudimentary IPS patching utility can create and apply IPS patches. The
IPS patches generated using this tool are slightly smaller than those
generated with `flips`, which might mean that `slips` IPS patches are the
smallest known to man.

## How to use

The primary interface for creating and applying patches is the `cli.js` script,
which is made accessible via the `slips` command once the package is installed
and/or linked via npm.

### Create a patch

There is little to no validation or safeguarding of output files, so any file
at the specified output path will be overwritten.

```
slips create [patch_name.ips] [original_rom.sfc] [modified_rom.sfc]
```

### Apply a patch

There is little to no validation or safeguarding of output files, so any file
at the specified output path will be overwritten.

```
slips apply [input_rom.sfc] [output_rom.sfc] [patch.ips]
```
