const service = process.argv[2];

async function startService(name) {
  if (name === 'knowledge') {
    const { startKnowledgePlane } = await import('../knowledge-plane/server.js');
    return startKnowledgePlane();
  }

  if (name === 'gateway') {
    const { startMedicalServer } = await import('../server/server.js');
    return startMedicalServer();
  }

  if (name === 'mcp-http') {
    const { startRemoteMcpHttpServer } = await import('../knowledge-plane/mcp-http.js');
    return startRemoteMcpHttpServer();
  }

  if (name === 'mcp-stdio') {
    const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
    const { initializeKnowledgePlane } = await import('../knowledge-plane/service.js');
    const { createKnowledgeMcpServer } = await import('../knowledge-plane/mcp.js');
    await initializeKnowledgePlane();
    const server = createKnowledgeMcpServer();
    return server.connect(new StdioServerTransport());
  }

  throw new Error(`Unknown service bootstrap target: ${name || '(missing)'}`);
}

startService(service).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
