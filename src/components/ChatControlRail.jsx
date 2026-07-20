import React from 'react';
import { Beaker, ChevronRight, FileText, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';

function contextValue(value, fallback = 'Not provided') {
  if (Array.isArray(value)) return value.length ? value.join(', ') : fallback;
  return value || fallback;
}

function shortDate(value) {
  if (!value) return 'No date';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function ChatControlRail({ profile, uploads = [], shares = [], selectedAttachmentIds = [], freshness, onManage }) {
  const context = profile?.context || {};
  const timeline = (profile?.timeline || []).slice(0, 3);
  const consentActive = Boolean(profile?.consent?.acceptedAt && !profile?.consent?.revokedAt);
  const selected = uploads.filter((item) => selectedAttachmentIds.includes(item.id));
  const visibleUploads = (selected.length ? selected : uploads).slice(0, 2);

  return (
    <aside className="desktop-control-preview assistant-control-rail" aria-label="Assistant control panel summary">
      <div className="control-rail-title">
        <div>
          <strong>Assistant Control Panel</strong>
          <span>Context, evidence and collaboration</span>
        </div>
        <button type="button" onClick={onManage}>Manage</button>
      </div>

      <section className="control-card patient-card">
        <div className="control-card-heading"><span><UserRound size={15}/> Patient context</span><button type="button" onClick={onManage}>Edit</button></div>
        <dl>
          <div><dt>Age range</dt><dd>{contextValue(context.ageRange)}</dd></div>
          <div><dt>Conditions</dt><dd>{contextValue(context.diagnoses)}</dd></div>
          <div><dt>Medications</dt><dd>{contextValue(context.medications)}</dd></div>
          <div><dt>Allergies</dt><dd>{contextValue(context.allergies)}</dd></div>
        </dl>
      </section>

      <section className="control-card consent-card">
        <div>
          <strong>Consent</strong>
          <span>{consentActive ? 'Active for selected assistant purposes' : 'Not recorded for this session'}</span>
        </div>
        <button type="button" className={`toggle-visual ${consentActive ? 'on' : ''}`} onClick={onManage} aria-label="Manage consent"><i/></button>
      </section>

      <section className="control-card">
        <div className="control-card-heading"><span><FileText size={15}/> Evidence attachments <b>{visibleUploads.length}</b></span><button type="button" onClick={onManage}>Manage</button></div>
        <div className="attachment-list">
          {visibleUploads.length ? visibleUploads.map((item) => (
            <div className="attachment-row" key={item.id}>
              <span className="file-tile"><FileText size={15}/></span>
              <div><strong>{item.filename}</strong><small>{item.mimeType || 'Evidence file'} · {Math.round((item.extraction?.confidence || 0) * 100) || '—'}% confidence</small></div>
              <ShieldCheck size={14}/>
            </div>
          )) : <button type="button" className="empty-action" onClick={onManage}>Attach governed evidence</button>}
        </div>
      </section>

      <section className="control-card timeline-card">
        <div className="control-card-heading"><span>Timeline summary</span><button type="button" onClick={onManage}>View all</button></div>
        {timeline.length ? <ol>{timeline.map((item) => <li key={item.id}><i/><time>{shortDate(item.occurredAt)}</time><div><strong>{item.label}</strong><span>{item.value || item.type}</span></div></li>)}</ol> : <p className="empty-copy">No user-confirmed timeline events.</p>}
      </section>

      <section className="control-card share-card">
        <div><span><LockKeyhole size={15}/> Share with clinicians</span><small>{shares.filter((item) => !item.revokedAt).length} active secure links</small></div>
        <button type="button" onClick={onManage}>Share case <ChevronRight size={14}/></button>
      </section>

      <section className="control-card lab-card">
        <div className="control-card-heading"><span><Beaker size={15}/> Lab explanation</span><button type="button" onClick={onManage}>Open</button></div>
        <div className="lab-preview"><strong>Reference-range comparison</strong><span>Uses only values and ranges supplied by the user.</span><b>{freshness?.level === 'fresh' ? 'Knowledge fresh' : 'Freshness checking'}</b></div>
      </section>
    </aside>
  );
}
