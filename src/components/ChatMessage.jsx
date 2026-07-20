import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {Sparkles,UserRound} from 'lucide-react';
export default function ChatMessage({message,isUser,isTyping=false}){return <div className={`message-line ${isUser?'user':'assistant'}`}><div className="message-avatar">{isUser?<UserRound size={16}/>:<Sparkles size={16}/>}</div><div className="message-stack"><div className="message-meta"><strong>{isUser?'You':'AI assistant'}</strong><span>{new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span></div><div className="message-card">{isTyping?<div className="thinking">Thinking <i/><i/><i/></div>:isUser?<div>{message}</div>:<ReactMarkdown remarkPlugins={[remarkGfm]} components={{a:({href,children})=><a href={href} target="_blank" rel="noreferrer">{children}</a>,table:({children})=><div className="table-scroll"><table>{children}</table></div>}}>{message}</ReactMarkdown>}</div></div></div>}
