#!/usr/bin/env node
// Machine-only stdout: called by the Codex auth subprocess, never by diagnostics.
import { readProviderCredential } from './lib/provider-credential.mjs';
const key=readProviderCredential(process.argv[2] || process.env.PRITHA_NEURALDEEP_KEYCHAIN_SERVICE);
if(!key)process.exitCode=1;else process.stdout.write(key);
