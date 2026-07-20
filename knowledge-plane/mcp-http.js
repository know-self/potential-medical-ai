import crypto from 'node:crypto';
import http from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { bearerToken, safeSecretEqual } from '../server/auth.js';
import { config } from '../server/config.js';
import { initializeKnowledgePlane } from './service.js';
import { createKnowledgeMcpServer } from './mcp.js';

const transports = new Map();

async function readJson(request, maxBytes = 1_000_000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined;
}

function allowedHost(request) {
  const hostHeader = String(request.headers.host || '');
  const hostname = hostHeader.replace(/^\[/, '').replace(/\].*$/, '').split(':')[0];
  return config.mcpHttp.allowedHosts.includes('*') || config.mcpHttp.allowedHosts.includes(hostname);
}

export function authorizeMcpToken(token) {
  if (safeSecretEqual(token, config.mcpHttp.syncBearerToken) && config.mcpHttp.allowSync) {
    return { authorized: true, allowSync: true, identity: 'mcp-sync-service' };
  }
  if (safeSecretEqual(token, config.mcpHttp.bearerToken)) {
    return { authorized: true, allowSync: false, identity: 'mcp-read-service' };
  }
  return { authorized: false, allowSync: false, identity: null };
}

function authorization(request) {
  return authorizeMcpToken(bearerToken(request));
}

function errorResponse(response, status, message) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({ error: message }));
}

export function createRemoteMcpHttpServer() {
  return http.createServer(async (request, response) => {
    if (!allowedHost(request)) return errorResponse(response, 421, 'Host not allowed');
    const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (requestUrl.pathname !== '/mcp') return errorResponse(response, 404, 'MCP route not found');
    const auth = authorization(request);
    if (!config.mcpHttp.bearerToken || !auth.authorized) return errorResponse(response, 401, 'Bearer token required');
    if (!['GET', 'POST', 'DELETE'].includes(request.method || '')) return errorResponse(response, 405, 'Method not allowed');

    try {
      const sessionId = String(request.headers['mcp-session-id'] || '');
      let transport = sessionId ? transports.get(sessionId) : null;
      let body;
      if (request.method === 'POST') body = await readJson(request);

      if (!transport) {
        if (request.method !== 'POST' || !isInitializeRequest(body)) {
          return errorResponse(response, 400, 'A valid MCP initialize request is required');
        }
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          onsessioninitialized: (id) => transports.set(id, transport)
        });
        transport.onclose = () => {
          if (transport.sessionId) transports.delete(transport.sessionId);
        };
        const server = createKnowledgeMcpServer({ allowSync: auth.allowSync });
        await server.connect(transport);
      }

      await transport.handleRequest(request, response, body);
    } catch (error) {
      if (!response.headersSent) errorResponse(response, /too large/i.test(error.message) ? 413 : 500, error.message);
      else response.end();
    }
  });
}

export async function startRemoteMcpHttpServer() {
  if (!config.mcpHttp.enabled) throw new Error('Remote MCP HTTP is disabled');
  if (!config.mcpHttp.bearerToken || config.mcpHttp.bearerToken.length < 24) {
    throw new Error('MCP_HTTP_BEARER_TOKEN must contain at least 24 characters');
  }
  await initializeKnowledgePlane();
  const server = createRemoteMcpHttpServer();
  await new Promise((resolve) => server.listen(config.mcpHttp.port, config.mcpHttp.host, resolve));
  console.log(`Authenticated MCP Streamable HTTP listening on http://${config.mcpHttp.host}:${config.mcpHttp.port}/mcp`);
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startRemoteMcpHttpServer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
