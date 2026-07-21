import React, { useState } from 'react';
import { ArrowRight, HeartPulse, LockKeyhole, ShieldCheck } from 'lucide-react';
import { medicalApi } from '../services/apiClient';

export default function AuthPage({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const result = mode === 'register'
        ? await medicalApi.register({ email, password })
        : await medicalApi.login({ email, password });
      onAuthenticated(result);
    } catch (requestError) {
      setError(requestError.message || 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  }

  const registering = mode === 'register';
  return <main className="auth-page">
    <section className="auth-intro">
      <div className="auth-brand"><span><HeartPulse size={21}/></span><strong>Potential Medical AI</strong></div>
      <div>
        <p className="eyebrow">Private clinical workspace</p>
        <h1>Evidence-aware care conversations, in one secure place.</h1>
        <p className="auth-copy">Your documents and user-provided context are encrypted, remain in your account, and are routed through the local evidence workflow automatically.</p>
      </div>
      <div className="auth-benefits">
        <div><ShieldCheck size={18}/><span><strong>Private by default</strong><small>Account-scoped storage and short-lived sessions.</small></span></div>
        <div><LockKeyhole size={18}/><span><strong>Evidence stays connected</strong><small>Attachments follow your conversation, not a browser tab.</small></span></div>
      </div>
    </section>

    <section className="auth-panel-wrap">
      <form className="auth-panel" onSubmit={submit}>
        <div className="auth-panel-head"><p className="eyebrow">{registering ? 'Create your account' : 'Welcome back'}</p><h2>{registering ? 'Start your private workspace' : 'Sign in to continue'}</h2><p>{registering ? 'Use an email and a password with at least 12 characters.' : 'Access your conversations, documents, and private context.'}</p></div>
        <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required autoFocus /></label>
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={registering ? 'new-password' : 'current-password'} minLength={12} required /></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="auth-submit" disabled={submitting}>{submitting ? 'Please wait…' : registering ? 'Create account' : 'Sign in'}<ArrowRight size={17}/></button>
        <p className="auth-switch">{registering ? 'Already have an account?' : 'New to Potential Medical AI?'} <button type="button" onClick={() => { setMode(registering ? 'login' : 'register'); setError(''); }}>{registering ? 'Sign in' : 'Create an account'}</button></p>
      </form>
    </section>
  </main>;
}
