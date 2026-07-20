#!/usr/bin/env node

const argv = process.argv.slice(2);
const processCommands = new Set(['dev', 'host', 'doctor', 'status', 'sync']);

try {
  if (processCommands.has(argv[0])) {
    const { runCli } = await import('../scripts/pmai-cli.js');
    await runCli(argv);
  } else {
    const { printUnifiedHelp, runTerminalCli } = await import('../scripts/pmai-terminal-cli.js');
    if (argv[0] === 'help') printUnifiedHelp();
    else await runTerminalCli(argv);
  }
} catch (error) {
  console.error(`\nCLI error: ${error.message}`);
  process.exitCode = 1;
}
