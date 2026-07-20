import React from 'react';
import { Clock3, ShieldCheck, Sparkles } from 'lucide-react';

const prompts = [
  'Summarize recent guidelines for heart failure',
  'Evidence for SGLT2i in CKD without diabetes',
  'Create a differential for acute chest pain'
];

export default function WelcomeMessage({ onExampleClick }) {
  return (
    <section className="welcome-state">
      <div className="welcome-icon"><Sparkles size={28}/></div>
      <h1>Hello. How can I help?</h1>
      <p>Your medical assistant, grounded in governed evidence and designed to keep uncertainty, source freshness and safety boundaries visible.</p>
      <div className="prompt-grid">{prompts.map((prompt) => <button type="button" key={prompt} onClick={() => onExampleClick(prompt)}>{prompt}</button>)}</div>
      <div className="trust-row">
        <div><ShieldCheck size={19}/><span><strong>Grounded evidence</strong><small>Versioned citations and review state</small></span></div>
        <div><ShieldCheck size={19}/><span><strong>Server-side safety</strong><small>No browser clinical fallback</small></span></div>
        <div><Clock3 size={19}/><span><strong>Freshness policy</strong><small>Required sources fail closed</small></span></div>
      </div>
    </section>
  );
}
