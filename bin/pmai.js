#!/usr/bin/env node
import { runCli } from '../scripts/pmai-cli.js';

runCli().catch((error) => {
  console.error(`\nCLI error: ${error.message}`);
  process.exitCode = 1;
});
