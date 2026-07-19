import { spawn } from 'node:child_process';

const includeWeb = process.argv.includes('--web');
const commands = [
  { name: 'knowledge-plane', command: process.execPath, args: ['knowledge-plane/server.js'] },
  { name: 'chat-gateway', command: process.execPath, args: ['server/server.js'] }
];

if (process.env.MCP_HTTP_ENABLED === 'true') {
  commands.push({ name: 'mcp-http', command: process.execPath, args: ['knowledge-plane/mcp-http.js'] });
}

if (includeWeb) {
  commands.push({
    name: 'web',
    command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: ['run', 'dev:web']
  });
}

const children = commands.map(({ name, command, args }) => {
  const child = spawn(command, args, { stdio: 'inherit', env: process.env });
  child.on('exit', (code, signal) => {
    if (code && code !== 0) {
      console.error(`${name} exited with code ${code}${signal ? ` (${signal})` : ''}`);
      shutdown(code);
    }
  });
  return child;
});

let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 1000).unref();
}

process.once('SIGINT', () => shutdown(0));
process.once('SIGTERM', () => shutdown(0));
