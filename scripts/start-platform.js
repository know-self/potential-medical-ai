import { runCli } from './pmai-cli.js';

const forwarded = process.argv.slice(2);
const includeWeb = forwarded.includes('--web');
const args = forwarded.filter((value) => value !== '--web');

runCli([
  includeWeb ? 'dev' : 'host',
  ...(!includeWeb ? ['--skip-build'] : []),
  ...args
]).catch((error) => {
  console.error(`Platform startup failed: ${error.message}`);
  process.exitCode = 1;
});
