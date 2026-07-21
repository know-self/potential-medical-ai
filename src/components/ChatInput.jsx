import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Mic, Paperclip, Send, X } from 'lucide-react';

export default function ChatInput({
  onSendMessage, isLoading, placeholder = 'Ask a clinical question…', disabled = false,
  exampleMessage = null, authenticated = false, attachments = [], onSelectFiles,
  onRemoveAttachment, onAuthenticationRequired
}) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef(null);
  const fileRef = useRef(null);
  const uploading = attachments.some((item) => item.status === 'uploading');
  useEffect(() => { if (exampleMessage) setMessage(exampleMessage); }, [exampleMessage]);
  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 144)}px`;
  }, [message]);
  const submit = (event) => {
    event.preventDefault();
    if (message.trim() && !isLoading && !disabled && !uploading) {
      onSendMessage(message.trim());
      setMessage('');
    }
  };
  const attach = () => authenticated ? fileRef.current?.click() : onAuthenticationRequired?.();
  return <div className="composer-shell">
    {attachments.length > 0 && <div className="attachment-chips" aria-label="Conversation attachments">
      {attachments.map((item) => <div className={`attachment-chip is-${item.status}`} key={item.localId || item.id}>
        {item.status === 'uploading' && <Loader2 size={13} className="spin"/>}
        {(item.status === 'warning' || item.status === 'failed') && <AlertTriangle size={13}/>}<span title={item.error || item.filename}>{item.filename}</span>
        <small>{item.status === 'warning' ? 'extraction warning' : item.status}</small>
        {item.status !== 'uploading' && <button type="button" onClick={() => onRemoveAttachment(item)} aria-label={`Detach ${item.filename}`}><X size={12}/></button>}
      </div>)}
    </div>}
    <form onSubmit={submit} className="composer">
      <input ref={fileRef} hidden multiple type="file" accept=".pdf,.txt,.json,.png,.jpg,.jpeg,application/pdf,text/plain,application/json,image/png,image/jpeg" onChange={(event) => { onSelectFiles?.(event.target.files); event.target.value = ''; }}/>
      <button type="button" className="composer-icon" onClick={attach} aria-label="Attach files"><Paperclip size={19}/></button>
      <div className="composer-field"><textarea ref={textareaRef} rows={1} value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(event); } }} placeholder={placeholder} disabled={disabled || isLoading}/><span>Shift + Enter for new line · Enter to send · Automatic evidence routing</span></div>
      <button type="button" className="composer-icon" aria-label="Voice"><Mic size={19}/></button>
      <button className="send-button" disabled={!message.trim() || isLoading || disabled || uploading}>{isLoading ? <Loader2 size={19} className="spin"/> : <Send size={19}/>}</button>
    </form>
  </div>;
}
