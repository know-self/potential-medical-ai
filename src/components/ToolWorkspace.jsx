import React from 'react';
import { Bot, Database, FileSearch, Network, ShieldCheck } from 'lucide-react';

function readiness(value, ready = 'Ready', waiting = 'Waiting') {
  return <span className={`tool-status ${value ? 'ready' : ''}`}>{value ? ready : waiting}</span>;
}

export default function ToolWorkspace({ status, attachmentCount = 0, onOpenEvidence }) {
  const knowledge = status?.knowledge;
  const modelReady = status?.models?.configured === true;
  const knowledgeReady = knowledge?.status === 'ok' && knowledge?.freshness?.usable !== false;
  return <section className="tools-workspace">
    <header className="tools-header"><div><p className="eyebrow">Local orchestration</p><h1>Tools and evidence flow</h1><p>These services run behind the local gateway. Routing is automatic; no retrieval mode needs to be selected in chat.</p></div><Network size={28}/></header>
    <div className="tool-grid">
      <article className="tool-card"><div className="tool-card-icon"><Bot size={20}/></div><div><div className="tool-card-title"><h2>Configured model</h2>{readiness(modelReady, 'Configured', 'Add PMAI_MODEL_* to .env')}</div><p>The gateway reads the endpoint, model, key, and generation settings from the local environment. Credentials never enter browser storage.</p></div></article>
      <article className="tool-card"><div className="tool-card-icon"><FileSearch size={20}/></div><div><div className="tool-card-title"><h2>Document retrieval</h2>{readiness(attachmentCount > 0, `${attachmentCount} attached`, 'No attachments')}</div><p>Validated PDFs, text, JSON, and images are encrypted and extracted server-side. Attached documents are always included as [D#] evidence.</p><button type="button" onClick={onOpenEvidence}>Open evidence workspace</button></div></article>
      <article className="tool-card"><div className="tool-card-icon"><Database size={20}/></div><div><div className="tool-card-title"><h2>Governed knowledge</h2>{readiness(knowledgeReady, knowledge?.freshness?.level || 'Ready', 'Checking')}</div><p>Evidence-sensitive questions automatically use the local knowledge plane. Greetings and simple conversation skip it, and unavailable knowledge falls back safely.</p></div></article>
      <article className="tool-card"><div className="tool-card-icon"><ShieldCheck size={20}/></div><div><div className="tool-card-title"><h2>Safety gateway</h2>{readiness(status?.status === 'ok')}</div><p>Medical safety checks, encrypted account access, ownership checks, and retrieval planning execute before the configured model receives a request.</p></div></article>
    </div>
  </section>;
}
