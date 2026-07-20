import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  clinicalGovernance,
  getDisease,
  getKnowledgeStatus,
  initializeKnowledgePlane,
  resolveSnomedTerm,
  resolveTerminology,
  searchKnowledge,
  sourceRegistry,
  synchronizeKnowledge
} from './service.js';

export function createKnowledgeMcpServer({ allowSync = process.env.MCP_ALLOW_SYNC === 'true' } = {}) {
  const server = new McpServer({
    name: 'potential-medical-ai-knowledge',
    version: '2.0.0'
  });

  server.registerTool(
    'search_medical_knowledge',
    {
      title: 'Search medical knowledge',
      description: 'Search versioned medical evidence. Returns provenance, evidence tier, review state, freshness, terminology matches, jurisdiction routing, and conflicts.',
      inputSchema: {
        query: z.string().min(2),
        limit: z.number().int().min(1).max(20).optional(),
        maxEvidenceTier: z.number().int().min(1).max(4).optional(),
        locale: z.enum(['auto', 'vi', 'en']).optional()
      }
    },
    async ({ query, limit = 8, maxEvidenceTier = 4, locale = 'auto' }) => {
      try {
        const result = searchKnowledge(query, { limit, maxEvidenceTier, locale });
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
    'resolve_medical_terminology',
    {
      title: 'Resolve medical terminology',
      description: 'Resolve English and Vietnamese disease aliases while preserving doses and units.',
      inputSchema: {
        text: z.string().min(1),
        locale: z.enum(['auto', 'vi', 'en']).optional(),
        limit: z.number().int().min(1).max(30).optional()
      }
    },
    async ({ text, locale = 'auto', limit = 10 }) => {
      const result = resolveTerminology(text, { locale, limit });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result
      };
    }
  );

  server.registerTool(
    'resolve_snomed_terminology',
    {
      title: 'Resolve SNOMED CT terminology',
      description: 'Query the configured licensed SNOMED FHIR terminology server. Returns disabled state when no server is configured.',
      inputSchema: { text: z.string().min(1), limit: z.number().int().min(1).max(50).optional() }
    },
    async ({ text, limit = 10 }) => {
      const result = await resolveSnomedTerm(text, { limit });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result
      };
    }
  );

  server.registerTool(
    'get_medical_knowledge_status',
    {
      title: 'Get medical knowledge status',
      description: 'Return connector health, freshness SLOs, source timestamps, clinical review queue, and governance state.'
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
    'get_clinical_review_queue',
    {
      title: 'Get clinical review queue',
      description: 'Read high-risk knowledge changes awaiting clinician review. This tool cannot approve or reject changes.'
    },
    async () => {
      const result = { items: clinicalGovernance.queue() };
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result
      };
    }
  );

  server.registerTool(
    'get_source_registry',
    {
      title: 'Get source and jurisdiction registry',
      description: 'Return source authority, jurisdiction, update mode, guidance eligibility, licensing validation state, and approval metadata.'
    },
    async () => {
      const result = sourceRegistry.list();
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result
      };
    }
  );

  server.registerTool(
    'sync_medical_sources',
    {
      title: 'Synchronize medical sources',
      description: 'Run configured source connectors. Disabled unless explicitly enabled for a trusted operator runtime.',
      inputSchema: { sources: z.array(z.string()).max(20).optional() }
    },
    async ({ sources }) => {
      if (!allowSync) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'MCP synchronization is disabled for this transport.' }]
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
    'medical-source-registry',
    'medical://knowledge/sources',
    { title: 'Medical source registry', description: 'Authority, jurisdiction, licensing validation, and source approval metadata', mimeType: 'application/json' },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(sourceRegistry.list(), null, 2) }]
    })
  );

  server.registerResource(
    'medical-clinical-review-queue',
    'medical://knowledge/review-queue',
    { title: 'Clinical review queue', description: 'High-risk medical knowledge changes awaiting review', mimeType: 'application/json' },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify({ items: clinicalGovernance.queue() }, null, 2) }]
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
      description: 'Template for answering only from versioned evidence, surfacing conflicts, and reporting freshness.',
      argsSchema: { question: z.string(), evidenceJson: z.string() }
    },
    ({ question, evidenceJson }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Answer the medical question using only the supplied versioned evidence. Distinguish guidelines from research candidates, preserve citations, expose jurisdiction or recommendation conflicts, and refuse treatment claims when freshness is stale.\n\nQuestion: ${question}\n\nEvidence: ${evidenceJson}`
        }
      }]
    })
  );

  return server;
}

async function main() {
  await initializeKnowledgePlane();
  const server = createKnowledgeMcpServer();
  await server.connect(new StdioServerTransport());
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
