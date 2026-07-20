import React, { useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, CircleDot, Clock3, ExternalLink, FileText, Filter, Link2, LockKeyhole, Search, ShieldCheck, SlidersHorizontal } from 'lucide-react';

const tabs = ['Evidence', 'Review', 'Share', 'Timeline'];

function confidenceLabel(value) {
  const number = Number(value || 0);
  if (number >= 0.9) return 'High';
  if (number >= 0.7) return 'Medium';
  return number > 0 ? 'Low' : 'Pending';
}

function formatDate(value, fallback = 'Not available') {
  if (!value) return fallback;
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function compactMessage(message = '') {
  return String(message).replace(/[#*_`>\[\]]/g, '').replace(/\n+/g, ' ').trim();
}

function EmptyEvidence({ onManage }) {
  return <div className="evidence-empty"><FileText size={30}/><strong>No evidence selected</strong><p>Upload a PDF, text or structured document. The viewer shows only extracted, provenance-preserving content.</p><button type="button" onClick={onManage}>Manage evidence</button></div>;
}

export default function EvidenceWorkspace({ messages = [], uploads = [], profile, shares = [], freshness, onManage, onBackToChat }) {
  const [activeTab, setActiveTab] = useState('Evidence');
  const [selectedId, setSelectedId] = useState(uploads[0]?.id || '');
  const selected = uploads.find((item) => item.id === selectedId) || uploads[0] || null;
  const userMessage = [...messages].reverse().find((item) => item.role === 'user');
  const assistantMessage = [...messages].reverse().find((item) => item.role === 'assistant');
  const timeline = profile?.timeline || [];
  const extraction = selected?.extraction || {};
  const snippets = useMemo(() => {
    if (Array.isArray(extraction.snippets)) return extraction.snippets.slice(0, 4);
    if (Array.isArray(extraction.citations)) return extraction.citations.slice(0, 4);
    return [];
  }, [extraction]);

  return (
    <section className="evidence-workspace">
      <aside className="case-thread">
        <div className="case-thread-head">
          <button type="button" className="case-back" onClick={onBackToChat}><ArrowLeft size={15}/> Chat</button>
          <span>Active case</span>
          <strong>{userMessage ? compactMessage(userMessage.content).slice(0, 54) : 'New evidence review'}</strong>
        </div>
        <div className="case-thread-scroll">
          {userMessage ? <div className="case-message user"><small>User</small><p>{compactMessage(userMessage.content)}</p></div> : null}
          {assistantMessage ? <div className="case-message assistant"><small>AI assistant</small><p>{compactMessage(assistantMessage.content).slice(0, 620)}</p></div> : <div className="case-thread-empty">Ask a question in Chat to create an active case.</div>}
          <div className="conflict-note"><CircleDot size={15}/><div><strong>Conflicts stay visible</strong><p>Jurisdiction or recommendation differences are disclosed instead of silently blended.</p></div></div>
        </div>
        <button type="button" className="case-followup" onClick={onBackToChat}>Ask a follow-up <ChevronRight size={15}/></button>
      </aside>

      <div className="evidence-main">
        <header className="workspace-tabs">
          <div>{tabs.map((tab) => <button type="button" key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{tab}</button>)}</div>
          <button type="button" className="workspace-settings" onClick={onManage}><SlidersHorizontal size={15}/> Case settings</button>
        </header>

        {activeTab === 'Evidence' && <div className="evidence-layout">
          <div className="evidence-column">
            <article className="document-viewer">
              <header>
                <div className="document-title"><span className="pdf-tile"><FileText size={17}/></span><div><strong>{selected?.filename || 'Select an evidence document'}</strong><small>{selected?.mimeType || 'No file selected'}{selected?.sizeBytes ? ` · ${Math.ceil(selected.sizeBytes / 1024)} KB` : ''}</small></div></div>
                <div className="document-pager"><span>Page {extraction.page || 1}</span><button type="button" aria-label="Previous page"><ChevronLeft size={15}/></button><button type="button" aria-label="Next page"><ChevronRight size={15}/></button></div>
              </header>
              <div className="document-tools"><label><Search size={15}/><input aria-label="Search document" placeholder="Search in document"/></label><button type="button"><Filter size={14}/> Filter</button></div>
              {selected ? <div className="document-canvas">
                <div className="page-strip">
                  {[1, 2, 3].map((page) => <button type="button" key={page} className={page === 2 ? 'active' : ''}><span>{page}</span><i/></button>)}
                </div>
                <div className="page-content">
                  <span className="document-kicker">Evidence extraction preview</span>
                  <h2>{selected.filename}</h2>
                  {snippets.length ? snippets.map((snippet, index) => <div className={`extracted-paragraph ${index === 0 ? 'highlighted' : ''}`} key={`${snippet.text || snippet.content}-${index}`}><p>{snippet.text || snippet.content}</p><span>{snippet.page ? `p. ${snippet.page}` : 'Source location retained'} · <b>{confidenceLabel(snippet.confidence ?? extraction.confidence)} confidence</b></span></div>) : <div className="extraction-placeholder"><ShieldCheck size={24}/><strong>{extraction.status === 'complete' ? 'Extraction complete' : 'Extraction pending'}</strong><p>Page-aware text appears here when the configured extractor returns provenance-linked snippets. The interface does not invent document content.</p></div>}
                </div>
              </div> : <EmptyEvidence onManage={onManage}/>} 
              <footer><span>Extraction: {extraction.status || 'not started'} · {confidenceLabel(extraction.confidence)} confidence</span><button type="button" onClick={onManage}>View source details <ExternalLink size={13}/></button></footer>
            </article>

            <article className="extraction-list">
              <div className="panel-title"><div><strong>Extracted for this case</strong><span>Only provenance-linked snippets are shown</span></div><b>{snippets.length}</b></div>
              {snippets.length ? snippets.map((snippet, index) => <div className="extraction-row" key={index}><p>{snippet.text || snippet.content}</p><span>{snippet.page ? `p. ${snippet.page}` : 'source'}</span><b className={`confidence ${confidenceLabel(snippet.confidence ?? extraction.confidence).toLowerCase()}`}>{confidenceLabel(snippet.confidence ?? extraction.confidence)}</b></div>) : <p className="panel-empty">No extracted snippets are available for this document yet.</p>}
            </article>
          </div>

          <aside className="review-column">
            <article className="review-panel">
              <div className="panel-title"><div><strong>Review</strong><span>Governed version state</span></div><button type="button" onClick={onManage}>Version compare</button></div>
              <div className="version-pair"><div><small>Current</small><strong>{extraction.version || 'Uploaded'}</strong><span className="status-chip approved">{extraction.status === 'complete' ? 'Extracted' : 'Pending'}</span></div><div><small>Previous</small><strong>{selected?.previousVersion || '—'}</strong><span className="status-chip">No prior version</span></div></div>
              <div className="change-summary"><strong>Quality checks</strong><ul><li><CheckCircle2 size={14}/> File type and signature validated</li><li><CheckCircle2 size={14}/> Encryption and retention policy applied</li><li><Clock3 size={14}/> Clinical review depends on change risk</li></ul></div>
              <div className="reviewer-row"><span className="reviewer-avatar">AI</span><div><strong>Automated ingestion</strong><small>Not a clinical approval</small></div><span className="status-chip approved">Recorded</span></div>
              <div className="audit-preview"><div><strong>Audit trail</strong><button type="button" onClick={onManage}>View all</button></div><p><time>{formatDate(selected?.createdAt)}</time><span>Evidence uploaded</span></p><p><time>{formatDate(selected?.updatedAt)}</time><span>{extraction.status || 'Awaiting extraction'}</span></p></div>
            </article>
          </aside>

          <div className="workspace-card-grid">
            <article className="workspace-card share-workspace-card"><div className="panel-title"><div><strong>Share with clinicians</strong><span>Expiring, revocable and audit logged</span></div><LockKeyhole size={16}/></div><div className="secure-link"><Link2 size={15}/><span>{shares.find((item) => !item.revokedAt)?.label || 'No active link'}</span><button type="button" onClick={onManage}>{shares.some((item) => !item.revokedAt) ? 'Manage' : 'Create'}</button></div></article>
            <article className="workspace-card timeline-workspace-card"><div className="panel-title"><div><strong>Patient timeline</strong><span>User-confirmed events only</span></div><Clock3 size={16}/></div>{timeline.length ? <ol>{timeline.slice(0, 4).map((item) => <li key={item.id}><i/><div><time>{formatDate(item.occurredAt)}</time><strong>{item.label}</strong><span>{item.value || item.type}</span></div></li>)}</ol> : <p className="panel-empty">No timeline events recorded.</p>}</article>
            <article className="workspace-card knowledge-workspace-card"><div className="panel-title"><div><strong>Knowledge & sources</strong><span>Fail-closed freshness policy</span></div><ShieldCheck size={16}/></div><div className="knowledge-state"><i className={freshness?.level === 'fresh' ? 'fresh' : ''}/><div><strong>Knowledge {freshness?.level || 'checking'}</strong><span>{formatDate(freshness?.checkedAt, 'Awaiting source verification')}</span></div></div><dl><div><dt>Required sources</dt><dd>{Object.values(freshness?.sources || {}).filter((item) => item.required).length}</dd></div><div><dt>Usable</dt><dd>{freshness?.usable === false ? 'No' : 'Yes'}</dd></div><div><dt>Policy</dt><dd>{freshness?.failClosed === false ? 'Warn' : 'Fail closed'}</dd></div></dl></article>
          </div>
        </div>}

        {activeTab === 'Review' && <div className="focused-workspace"><ShieldCheck size={36}/><h2>Clinical review workspace</h2><p>Open Assistant controls to manage review status, source governance and version history. Distinct reviewer identities remain required for high-risk changes.</p><button type="button" onClick={onManage}>Open review controls</button></div>}
        {activeTab === 'Share' && <div className="focused-workspace"><LockKeyhole size={36}/><h2>Secure clinician sharing</h2><p>Create expiring, revocable links with redaction, consent snapshots and access auditing.</p><button type="button" onClick={onManage}>Manage secure sharing</button></div>}
        {activeTab === 'Timeline' && <div className="focused-workspace"><Clock3 size={36}/><h2>Longitudinal timeline</h2><p>Timeline events remain encrypted, user-confirmed and separate from model-generated claims.</p><button type="button" onClick={onManage}>Manage timeline</button></div>}
      </div>
    </section>
  );
}
