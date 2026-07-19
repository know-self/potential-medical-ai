import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  getDisease,
  getKnowledgeStatus,
  initializeKnowledgePlane,
  searchKnowledge,
  synchronizeKnowledge
} from './service.js';

const server = new McpServer({
  name: 'potential-medical-ai-knowledge',
  version: '1.0.0'
});

server.registerTool(
  'search_medical_knowledge',
  {
    title: 'Search medical knowledge',
    description: 'Search versioned medical evidence. Returns provenance, evidence tier, review state, and freshness.',
    inputSchema: {
      query: z.string().min(2),
      limit: z.number().int().min(1).max(20).optional(),
      maxEvidenceTier: z.number().int().min(1).max(4).optional()
    }
  },
  async ({ query, limit = 8, maxEvidenceTier = 4 }) => {
    try {
      const result = searchKnowledge(query, { limit, maxEvidenceTier });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ error: error.message, freshness: error.freshness || null }, null, 2) }]
      };
    }
  }
);

server.registerTool(
  'get_medical_knowledge_status',
  {
    title: 'Get medical knowledge status',
    description: 'Return connector health, freshness SLOs, source timestamps, and clinical review queue.'
  },
  async () => {
    const status = getKnowledgeStatus();
    return {
      content: [{ type: 'text', text: JSON.stringify(status, null, 2) }],
      structuredContent: status
    };
  }
);

server.registerTool(
  'sync_medical_sources',
  {
    title: 'Synchronize medical sources',
    description: 'Run configured source connectors. Disabled unless MCP_ALLOW_SYNC=true.',
    inputSchema: { sources: z.array(z.string()).max(20).optional() }
  },
  async ({ sources }) => {
    if (process.env.MCP_ALLOW_SYNC !== 'true') {
      return {
        isError: true,
        content: [{ type: 'text', text: 'MCP synchronization is disabled. Set MCP_ALLOW_SYNC=true only for a trusted operator runtime.' }]
      };
    }
    const result = await synchronizeKnowledge(sources);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      structuredContent: result
    };
  }
);

server.registerResource(
  'medical-knowledge-status',
  'medical://knowledge/status',
  { title: 'Medical knowledge status', description: 'Freshness and source health for the medical knowledge plane', mimeType: 'application/json' },
  async (uri) => ({
    contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(getKnowledgeStatus(), null, 2) }]
  })
);

server.registerResource(
  'medical-disease-profile',
  new ResourceTemplate('medical://disease/{diseaseId}', { list: undefined }),
  { title: 'Disease profile', description: 'Curated disease and comorbidity profile', mimeType: 'application/json' },
  async (uri, { diseaseId }) => {
    const disease = getDisease(String(diseaseId));
    return {
      contents: [{
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify(disease || { error: 'Disease not found' }, null, 2)
      }]
    };
  }
);

server.registerPrompt(
  'ground_medical_answer',
  {
    title: 'Ground medical answer',
    description: 'Template for answering only from versioned evidence and reporting freshness.',
    argsSchema: { question: z.string(), evidenceJson: z.string() }
  },
  ({ question, evidenceJson }) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Answer the medical question using only the supplied versioned evidence. Distinguish guidelines from research candidates, preserve citations, and refuse treatment claims when freshness is stale.\n\nQuestion: ${question}\n\nEvidence: ${evidenceJson}`
      }
    }]
  })
);

await initializeKnowledgePlane();
await server.connect(new StdioServerTransport());
