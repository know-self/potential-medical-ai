import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serviceNames = new Set(['knowledge', 'gateway', 'mcp-http', 'mcp-stdio']);
const toolScripts = {
  vite: path.join('node_modules', 'vite', 'bin', 'vite.js'),
  'json-server': path.join('node_modules', 'json-server', 'lib', 'cli', 'bin.js')
};

export function createNodeInvocation(scriptPath, args = [], cwd = projectRoot) {
  return {
    command: process.execPath,
    args: [path.resolve(cwd, scriptPath), ...args]
  };
}

export function createServiceInvocation(service, cwd = projectRoot) {
  if (!serviceNames.has(service)) throw new Error(`Unknown local service: ${service}`);
  return createNodeInvocation(path.join('scripts', 'service-bootstrap.js'), [service], cwd);
}

export function createToolInvocation(tool, args = [], cwd = projectRoot) {
  const scriptPath = toolScripts[tool];
  if (!scriptPath) throw new Error(`Unknown local tool: ${tool}`);
  return createNodeInvocation(scriptPath, args, cwd);
}

export { projectRoot };
