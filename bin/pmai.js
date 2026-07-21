#!/usr/bin/env node

const argv = process.argv.slice(2);
const processCommands = new Set(['dev', 'host', 'doctor', 'status', 'sync']);

try {
  if (process.platform === 'win32' && processCommands.has(argv[0])) {
    const { runWindowsCli } = await import('../scripts/pmai-windows-runtime.js');
    await runWindowsCli(argv);
  } else if (processCommands.has(argv[0])) {
    const { runCli } = await import('../scripts/pmai-cli.js');
    await runCli(argv);
  } else {
    const { printUnifiedHelp, runTerminalCli } = await import('../scripts/pmai-terminal-cli.js');
    if (argv[0] === 'help' || argv.includes('--help') || argv.includes('-h')) printUnifiedHelp();
    else await runTerminalCli(argv);
  }
} catch (error) {
  console.error(`\nCLI error: ${error.message}`);
  process.exitCode = 1;
}
