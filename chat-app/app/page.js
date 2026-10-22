'use client';
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import Calling from './calling';
import StatusPanel from './status-panel';
import ReactionBar from './reaction-bar';
import Avatar from './avatar';
import Icon from './icons';
import MediaUpload from './media-upload';
import MessageMedia from './message-media';
import ProfilePhoto from './profile-photo';
import { applyFormat, formatMessage } from '../lib/formatting.mjs';
async function api(path, data) {
  const response = await fetch(`/api/${path}`, data ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {});
  const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
}
export default function Home() {
  const [user, setUser] = useState(null), [loading, setLoading] = useState(true), [signup, setSignup] = useState(false);
  const [users, setUsers] = useState([]), [peer, setPeer] = useState(null), [messages, setMessages] = useState([]);
  const [search, setSearch] = useState(''), [draft, setDraft] = useState(''), [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [connected, setConnected] = useState(false), [historyLoading, setHistoryLoading] = useState(false);
  const mediaInput = useRef(null);
  const [liveSocket,setLiveSocket]=useState(null);
  const [savingContact,setSavingContact]=useState(false),[contactEmail,setContactEmail]=useState(''),[addingContact,setAddingContact]=useState(false);
  function contactUpdated(profile){api('users').then(r=>setUsers(r.users)).catch(e=>setError(e.message));setPeer(current=>current?.id===profile.id?{...current,...profile}:current);}
  function chatDeleted(result){setUsers(items=>items.filter(u=>u.id!==result.with));setPeer(current=>current?.id===result.with?null:current);}
  async function deleteChat(){if(!peer||clearing)return;if(!window.confirm('Delete this entire chat from your account? The other person keeps their messages. Your saved contact stays saved.'))return;setClearing(true);try{const response=await fetch(`/api/chats/${peer.id}`,{method:'DELETE'});const result=await response.json();if(!response.ok)throw Error(result.error);chatDeleted({with:peer.id});}catch(e){setError(e.message);}finally{setClearing(false);}}
  async function addContact(e){e.preventDefault();if(savingContact)return;setSavingContact(true);setError('');try{const result=await api('contacts',{email:contactEmail});contactUpdated(result.user);setPeer(result.user);setContactEmail('');setAddingContact(false);}catch(e){setError(e.message);}finally{setSavingContact(false);}}
  async function toggleContact(){if(!peer||savingContact)return;setSavingContact(true);try{const response=await fetch(`/api/contacts/${peer.id}`,{method:peer.savedContact?'DELETE':'POST'});const result=await response.json();if(!response.ok)throw Error(result.error);contactUpdated(result.user);}catch(e){setError(e.message);}finally{setSavingContact(false);}}
  const [attachment, setAttachment] = useState(null), [statusOpen,setStatusOpen]=useState(false);
  const composerInput = useRef(null), reactionUpdates = useRef(new Map());
  const [reacting, setReacting] = useState(null);
  const socket = useRef(null), end = useRef(null), active = useRef(null), deletedIds = useRef(new Set()), hiddenIds = useRef(new Set());
  const [dark, setDark] = useState(false), [chatFilter, setChatFilter] = useState('all'), [messageSearch, setMessageSearch] = useState(''), [showMessageSearch, setShowMessageSearch] = useState(false), [emojiOpen, setEmojiOpen] = useState(false);
  useEffect(() => { setDark(localStorage.getItem('hello-dark') === 'true'); }, []);
  const [selectedMessageId, setSelectedMessageId] = useState(null), [clearing, setClearing] = useState(false);
  const [deleting, setDeleting] = useState(null), [photoOpen, setPhotoOpen] = useState(false);
  useEffect(() => { api('me').then(r => setUser(r.user)).catch(e => { if (e.message !== 'Please sign in.') setError(e.message); }).finally(() => setLoading(false)); }, []);
  useEffect(() => {
    if (!user) return;
    hiddenIds.current = new Set();
    const refresh = () => api('users').then(r => setUsers(r.users)).catch(e => setError(e.message)); refresh();
    const timer = setInterval(refresh, 15000);
    const s = io(); socket.current = s; setLiveSocket(s);
    s.on('connect', () => setConnected(true)); s.on('disconnect', () => setConnected(false));
    s.on('connect_error', e => { setConnected(false); setError(e.message); });
    s.on('contact:updated',contactUpdated);s.on('chat:deleted',chatDeleted);
    s.on('profile:updated', profile => {
      setUsers(items => items.map(item => item.id === profile.id ? { ...item, avatarUrl: profile.avatarUrl } : item));
      setPeer(current => current?.id === profile.id ? { ...current, avatarUrl: profile.avatarUrl } : current);
      setUser(current => current?.id === profile.id ? { ...current, avatarUrl: profile.avatarUrl } : current);
    });
    s.on('message:receipt', receipt => {setMessages(items=>items.map(m=>m.id===receipt.id?{...m,deliveredAt:m.deliveredAt||receipt.deliveredAt,readAt:m.readAt||receipt.readAt}:m));setUsers(items=>items.map(u=>u.lastMessage?.id===receipt.id?{...u,lastMessage:{...u.lastMessage,deliveredAt:u.lastMessage.deliveredAt||receipt.deliveredAt,readAt:u.lastMessage.readAt||receipt.readAt}}:u));});
    s.on('chat:cleared', result => { applyCleared(result); refresh(); });
    s.on('message:hidden', m => { applyHidden(m.id); refresh(); });
    s.on('message:reactions', updateReactions);
    s.on('message:deleted', m => { setUsers(items => items.map(item => item.lastMessage?.id === m.id || item.lastMessage?._id === m.id ? { ...item, lastMessage: { ...item.lastMessage, text: undefined, deleted: true } } : item)); deletedIds.current.add(m.id); setMessages(prev => prev.map(item => item.id === m.id ? { ...item, text: undefined, deleted: true, reactions: {} } : item)); });
    s.on('message:new', receiveMessage);
    return () => { clearInterval(timer); s.disconnect(); socket.current = null; };
  }, [user?.id]);
  useEffect(() => {
    active.current = peer?.id; setMessages([]); setDraft(''); setMessageSearch(''); setShowMessageSearch(false); setEmojiOpen(false); setAttachment(null); setSelectedMessageId(null); if (!peer) return;
    let ignore = false; setHistoryLoading(true); setError('');
    api(`messages?with=${peer.id}`).then(r => { if (!ignore) setMessages(prev => { const unique = new Map([...r.messages, ...prev].map(m => { const update = reactionUpdates.current.get(m.id); const current = update && update.reactionVersion > (m.reactionVersion || 0) ? { ...m, ...update } : m; return [m.id, deletedIds.current.has(m.id) ? { ...current, text: undefined, deleted: true, reactions: {} } : current]; })); return [...unique.values()].filter(m => !hiddenIds.current.has(m.id)).sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt)); }); }).catch(e => { if (!ignore) setError(e.message); }).finally(() => { if (!ignore) setHistoryLoading(false); });
    return () => { ignore = true; };
  }, [peer?.id]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(()=>{
    if(!user||!peer||!connected||historyLoading)return;
    const seen=new Set();
    const observer=new IntersectionObserver(entries=>{
      if(document.visibilityState!=='visible'||!document.hasFocus()||document.querySelector('dialog[open],.call-overlay'))return;
      const ids=entries.filter(e=>e.isIntersecting).map(e=>e.target.dataset.receiptId).filter(id=>!seen.has(id));
      if(!ids.length)return;ids.forEach(id=>seen.add(id));
      socket.current?.timeout(10000).emit('message:receipts',{ids,read:true},(err,result)=>{if(err||result?.error)ids.forEach(id=>seen.delete(id));});
    },{threshold:0.1});
    const watch=()=>{observer.disconnect();if(document.visibilityState==='visible'&&document.hasFocus())document.querySelectorAll('[data-receipt-id]').forEach(el=>observer.observe(el));};
    watch();document.addEventListener('visibilitychange',watch);window.addEventListener('focus',watch);
    return()=>{observer.disconnect();document.removeEventListener('visibilitychange',watch);window.removeEventListener('focus',watch);};
  },[user?.id,peer?.id,connected,historyLoading,messages,statusOpen]);
  async function auth(event) {
    event.preventDefault(); setBusy(true); setError(''); const data = Object.fromEntries(new FormData(event.currentTarget));
    try { setUser((await api(signup ? 'signup' : 'login', data)).user); } catch(e) { setError(e.message); } finally { setBusy(false); }
  }
  function updateReactions(update) {
    const previous = reactionUpdates.current.get(update.id);
    if (previous && previous.reactionVersion > update.reactionVersion) return;
    reactionUpdates.current.set(update.id, update);
    setMessages(items => items.map(m => m.id === update.id && !m.deleted && (m.reactionVersion || 0) <= update.reactionVersion ? { ...m, ...update } : m));
  }
  function reactToMessage(message, emoji) {
    if (!connected || reacting) return;
    setReacting(message.id); setError('');
    const selected = message.reactions?.[user.id] === emoji ? null : emoji;
    socket.current.timeout(10000).emit('message:react', { id: message.id, emoji: selected }, (err, result) => {
      setReacting(null);
      if (err || result?.error) setError(result?.error || 'Reaction could not be confirmed. Please try again.');
      else updateReactions(result);
    });
  }
  function applyCleared(result) {
    for(const id of result.ids)hiddenIds.current.add(id);
    setMessages(items=>items.filter(m=>!hiddenIds.current.has(m.id)));setSelectedMessageId(null);
  }
  function clearChat() {
    if(!peer || !connected || clearing)return;
    if(!window.confirm(`Clear your chat with ${peer.name}? Messages will be removed only for you. The other person keeps their chat.`))return;
    setClearing(true);setError('');
    socket.current.timeout(10000).emit('chat:clear',{with:peer.id},(err,result)=>{
      setClearing(false);
      if(err || result?.error)setError(result?.error || 'Clearing could not be confirmed. Please try again.');
      else {applyCleared(result);api('users').then(r=>setUsers(r.users)).catch(e=>setError(e.message));}
    });
  }
  function applyHidden(id) {
    hiddenIds.current.add(id);setMessages(items=>items.filter(m=>m.id!==id));setSelectedMessageId(null);
  }
  function deleteForMe(id) {
    if(!connected || deleting)return;setDeleting(id);setError('');
    socket.current.timeout(10000).emit('message:hide',{id},(err,result)=>{
      setDeleting(null);
      if(err || result?.error)setError(result?.error || 'Deletion could not be confirmed. Please try again.');
      else {applyHidden(id);api('users').then(r=>setUsers(r.users)).catch(e=>setError(e.message));}
    });
  }
  function deleteMessage(id) {
    if (!connected || deleting) return;
    setDeleting(id); setError('');
    socket.current.timeout(10000).emit('message:delete', { id }, (err, result) => {
      setDeleting(null);
      if (err || result?.error) setError(result?.error || 'Deletion could not be confirmed. Please try again.');
      else { setSelectedMessageId(null); deletedIds.current.add(id); setMessages(prev => prev.map(m => m.id === id ? { ...m, text: undefined, deleted: true, reactions: {} } : m)); }
    });
  }
  async function logout() { try { await api('logout', {}); setUser(null); setPeer(null); setMessages([]); setConnected(false); setError(''); } catch(e) { setError(e.message); } }
  function formatDraft(marker) {
    const input = composerInput.current;
    if (!input) return;
    const next = applyFormat(draft, input.selectionStart, input.selectionEnd, marker);
    if (next.text.length > 2000) { setError('Keep your message within 2000 characters, including formatting.'); return; }
    setDraft(next.text);
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(next.start, next.end); });
  }
  function receiveMessage(message) {
    if(message.to===user.id)socket.current?.timeout(10000).emit('message:receipts',{ids:[message.id]},()=>{});
    if(hiddenIds.current.has(message.id))return;
    const m=deletedIds.current.has(message.id) ? { ...message,text:undefined,deleted:true,reactions:{} } : message;
    setUsers(items=>items.map(item=>item.id===(m.from===user.id?m.to:m.from)?{...item,lastMessage:m}:item));
    if(m.from===active.current||m.to===active.current)setMessages(prev=>prev.some(item=>item.id===m.id)?prev:[...prev,m]);
  }
  function chooseAttachment(e) {
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    const image=['image/jpeg','image/png','image/webp'].includes(file.type),video=['video/mp4','video/webm'].includes(file.type);
    if(!image&&!video){setError('Choose a JPG, PNG, WebP, MP4 or WebM file.');return;}
    if(file.size>(image?5:10)*1024*1024){setError(image?'Photos must be 5 MB or smaller.':'Videos must be 10 MB or smaller.');return;}
    setError('');setAttachment(file);
  }
  function send(event) {
    event.preventDefault(); if (!draft.trim() || !peer || !connected || busy) return;
    setBusy(true); setError(''); const text = draft;
    socket.current.timeout(10000).emit('message:send', { to: peer.id, text }, (err, result) => { setBusy(false); if (err || result?.error) setError(result?.error || 'Delivery could not be confirmed. Check your conversation before retrying.'); else setDraft(current => current === text ? '' : current); });
  }
  function toggleTheme() { setDark(value => { localStorage.setItem('hello-dark', String(!value)); return !value; }); }
  function insertEmoji(emoji) {
    const input = composerInput.current, start = input?.selectionStart ?? draft.length, finish = input?.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + emoji + draft.slice(finish);
    if (next.length > 2000) return;
    setDraft(next); setEmojiOpen(false);
    requestAnimationFrame(() => { input?.focus(); input?.setSelectionRange(start + emoji.length, start + emoji.length); });
  }
  const previewText = message => !message ? 'Say hello 👋' : message.deleted ? 'This message was deleted' : `${message.mediaType === 'image' ? '📷 ' : message.mediaType === 'video' ? '🎬 ' : ''}${message.text?.replace(/\*/g, '').replace(/^[📷🎬]\s*/u,'') || ''}`;
  const visibleUsers = users.filter(u => `${u.name} ${u.email}`.toLowerCase().includes(search.toLowerCase()) && (chatFilter === 'all' || u.lastMessage)).sort((a, b) => new Date(b.lastMessage?.createdAt || 0) - new Date(a.lastMessage?.createdAt || 0));
  const selectedMessage = messages.find(m => m.id === selectedMessageId);
  const visibleMessages = messages.filter(m => !messageSearch || (!m.deleted && m.text?.toLowerCase().includes(messageSearch.toLowerCase())));
  if (loading) return <div className="loading"><span className="brand">hello<span>✳</span></span><p>Opening your space…</p></div>;
  if (!user) return <main className="auth-shell"><section className="intro"><a className="brand" href="/">hello<span>✳</span></a><div><span className="eyebrow">GOOD CONVERSATIONS START HERE</span><h1>A little hello.<br/>A lot closer.</h1><p>Your people, just a message away.<br/>A simple space for everyday conversations.</p><div className="art"><div className="art-message">Hey, how’s your day going? <span>10:24</span></div><div className="art-message reply">Better now that you’re here ✨ <span>10:25</span></div><div className="art-spark">✳</div></div></div><span className="intro-foot">Small moments. Real connections.</span></section><section className="auth"><div className="auth-card"><span className="eyebrow">YOUR NEXT CONVERSATION AWAITS</span><h2>{signup ? 'Make yourself at home.' : 'Welcome back.'}</h2><p>{signup ? 'Create an account and say your first hello.' : 'Sign in to pick up where you left off.'}</p><form onSubmit={auth}>{signup && <label>Your name<input name="name" autoComplete="name" required maxLength={60} placeholder="Alex Morgan"/></label>}<label>Email address<input type="email" name="email" autoComplete="email" required placeholder="you@example.com"/></label><label>Password<input type="password" name="password" autoComplete={signup ? 'new-password' : 'current-password'} minLength={8} maxLength={128} required placeholder="At least 8 characters"/></label>{error && <p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy ? 'One moment…' : signup ? 'Create account →' : 'Sign in →'}</button></form><p className="switch">{signup ? 'Already have an account?' : 'New around here?'} <button onClick={() => { setSignup(!signup); setError(''); }}>{signup ? 'Sign in' : 'Create an account'}</button></p><div className="privacy">◈ &nbsp; Your conversations. Your space.</div></div></section></main>;
  return <><main className={`chat-shell whatsapp-layout ${peer ? 'has-peer' : ''} ${dark ? 'dark' : ''}`}>
    <nav className="app-rail" aria-label="App navigation">
      <button className="rail-logo" onClick={() => setPeer(null)} aria-label="Open chats"><Icon name="chat" size={28}/></button>
      <button className="rail-active" onClick={() => setPeer(null)} aria-label="Chats"><Icon name="chat"/></button>
      <button onClick={()=>setStatusOpen(true)} aria-label="Status updates" title="Status updates">◉</button><div className="rail-spacer"/>
      <button onClick={toggleTheme} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} title="Change theme"><Icon name={dark ? 'sun' : 'moon'}/></button>
      <button onClick={() => setPhotoOpen(true)} aria-label="Edit your profile photo"><Avatar person={user}/></button>
    </nav>
    <aside className="sidebar">
      <div className="sidebar-top"><div><span className="app-wordmark">hello<span>chat</span></span><h1>Chats</h1></div><div className="sidebar-actions"><button className="icon-button" onClick={()=>setStatusOpen(true)} aria-label="Status updates" title="Status updates">◉</button><button className="icon-button mobile-theme" onClick={toggleTheme} aria-label="Change theme"><Icon name={dark ? 'sun' : 'moon'}/></button><button className="icon-button" aria-label="Find a person to chat with" onClick={() => setAddingContact(v=>!v)} title="New chat"><Icon name="chat"/></button></div></div>
      {addingContact&&<form className="add-contact-form" onSubmit={addContact}><label>Contact’s account email<input type="email" required maxLength={254} value={contactEmail} onChange={e=>setContactEmail(e.target.value)} placeholder="friend@example.com"/></label><button disabled={savingContact}>{savingContact?'Saving…':'Save contact'}</button></form>}
      <label className="search"><Icon name="search" size={18}/><input id="people-search" aria-label="Search people" placeholder="Search your contacts and chats" value={search} onChange={e => setSearch(e.target.value)}/></label>
      <div className="chat-filters" role="group" aria-label="Filter chats"><button className={chatFilter === 'all' ? 'active' : ''} aria-pressed={chatFilter === 'all'} onClick={() => setChatFilter('all')}>All</button><button className={chatFilter === 'recent' ? 'active' : ''} aria-pressed={chatFilter === 'recent'} onClick={() => setChatFilter('recent')}>Recent chats</button><span>{visibleUsers.length} people</span></div>
      <div className="people">{visibleUsers.map((u,i) => <button key={u.id} className={`person ${peer?.id === u.id ? 'selected' : ''}`} onClick={() => setPeer(u)}><Avatar person={u} className={`color-${i % 4}`}/><span className="person-info"><span className="person-heading"><strong>{u.name}</strong>{u.lastMessage && <time>{new Date(u.lastMessage.createdAt).toLocaleDateString([], { month:'short', day:'numeric' })}</time>}</span><span className="person-preview">{u.lastMessage?.from === user.id && <span className={"sent-check delivery-ticks "+(u.lastMessage.readAt?"read":"")} aria-label={u.lastMessage.readAt?"Read":u.lastMessage.deliveredAt?"Delivered":"Sent"}>{u.lastMessage.deliveredAt||u.lastMessage.readAt?"✓✓":"✓"} </span>}{previewText(u.lastMessage)}</span></span></button>)}{visibleUsers.length === 0 && <div className="empty-list"><Icon name="chat" size={35}/><p>{search ? 'No people found. Try another name.' : chatFilter === 'recent' ? 'Your conversations will appear here. Use New chat to add a contact.' : 'Use New chat to save a contact by their account email.'}</p></div>}</div>
      <div className="profile"><button type="button" className="profile-photo-button" aria-label="Edit your profile photo" title="Add or change profile photo" onClick={() => setPhotoOpen(true)}><Avatar person={user}/><span className="photo-badge">+</span></button><div><strong>{user.name}</strong><span><i className={connected ? 'online' : ''}/> {connected ? 'Connected' : 'Reconnecting…'}</span></div><button onClick={logout} aria-label="Sign out" title="Sign out"><Icon name="logout" size={20}/></button></div>
    </aside>
    <section className="conversation">{peer ? <>
      <header className="chat-header"><button className="back" aria-label="Back to people" onClick={() => selectedMessage ? setSelectedMessageId(null) : setPeer(null)}><Icon name="back"/></button><Avatar person={peer}/><div className="chat-peer"><h2>{selectedMessage ? '1 message selected' : peer.name}</h2><p>{selectedMessage ? (selectedMessage.from === user.id ? 'Sent by you' : 'Received message') : (peer.savedContact ? (peer.email||'Saved contact') : 'Save contact to view profile photo')}</p></div>{selectedMessage && <div className="header-message-actions"><button type="button" className="header-delete-for-me" disabled={!connected || deleting !== null} onClick={() => deleteForMe(selectedMessage.id)}>{deleting === selectedMessage.id ? 'Deleting…' : 'Delete for me'}</button>{selectedMessage.from === user.id && !selectedMessage.deleted && <button type="button" className="header-delete" disabled={!connected || deleting !== null} onClick={() => deleteMessage(selectedMessage.id)}>{deleting === selectedMessage.id ? 'Deleting…' : 'Delete for everyone'}</button>}<button type="button" className="icon-button" aria-label="Cancel message selection" onClick={() => setSelectedMessageId(null)}><Icon name="close" size={18}/></button></div>}<div id="call-toolbar"/><div className="format-toolbar header-format" role="toolbar" aria-label="Text formatting"><button type="button" onMouseDown={e => e.preventDefault()} onClick={() => formatDraft('**')} aria-label="Bold" title="Bold (Ctrl/⌘ + B)"><strong>B</strong></button><button type="button" onMouseDown={e => e.preventDefault()} onClick={() => formatDraft('*')} aria-label="Italic" title="Italic (Ctrl/⌘ + I)"><em>I</em></button></div>{!selectedMessage&&<details className="chat-menu"><summary aria-label="Chat options" title="Chat options">⋮</summary><div className="chat-menu-panel">{!selectedMessage&&<button className="header-contact" disabled={savingContact} onClick={toggleContact}>{savingContact?'Saving…':peer.savedContact?'Remove contact':'Save contact'}</button>}<button onClick={()=>setShowMessageSearch(v=>!v)}>Search messages</button><a href={`/api/messages/export?with=${peer.id}`} download>Export chat</a><button disabled={!connected||clearing||!messages.length} onClick={clearChat}>Clear messages</button><button className="danger" disabled={clearing} onClick={deleteChat}>Delete chat</button><small>Only your copy is removed</small></div></details>}</header>
      {showMessageSearch && <div className="message-search"><Icon name="search" size={18}/><input aria-label="Search loaded messages" placeholder="Search the latest 100 messages" value={messageSearch} onChange={e => setMessageSearch(e.target.value)}/><button className="icon-button" aria-label="Close message search" onClick={() => { setShowMessageSearch(false); setMessageSearch(''); }}><Icon name="close" size={18}/></button></div>}
      <div className="messages"><div className="conversation-notice">Your conversation with {peer.name}. Make it a good one.</div>{historyLoading && <p className="history-loading">Loading conversation…</p>}{!historyLoading && !messages.length && <div className="conversation-start"><Avatar person={peer} className="large"/><h3>Say hello to {peer.name.split(' ')[0]} 👋</h3><p>A new conversation starts with you.</p></div>}
      {visibleMessages.map((m,index) => <div key={m.id}>{(index === 0 || new Date(visibleMessages[index-1].createdAt).toDateString() !== new Date(m.createdAt).toDateString()) && <div className="date-divider"><span>{new Date(m.createdAt).toLocaleDateString([], { day:'numeric', month:'long', year:'numeric' })}</span></div>}<div data-receipt-id={m.to===user.id&&!m.deleted&&!m.readAt?m.id:undefined} className={`message-row ${m.from === user.id ? 'mine' : ''} ${selectedMessage?.id === m.id ? 'message-selected' : ''}`}><div className="bubble">{!m.deleted && m.mediaType && <MessageMedia message={m}/>}<p className={m.deleted ? 'deleted-text' : undefined}>{m.deleted ? 'This message was deleted' : formatMessage(m.text)}</p><div className="message-meta">{<button type="button" className="message-select" aria-label="Select message for deletion" aria-pressed={selectedMessage?.id === m.id} title="Select message for deletion from the top bar" onClick={() => setSelectedMessageId(current => current === m.id ? null : m.id)}>{selectedMessage?.id === m.id ? '✓' : '⋯'}</button>}<time>{new Date(m.createdAt).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</time>{m.from === user.id && <span className={"sent-check delivery-ticks "+(m.readAt?"read":"")} title={m.readAt?"Read "+new Date(m.readAt).toLocaleString():m.deliveredAt?"Delivered":"Sent"} aria-label={m.readAt?"Read":m.deliveredAt?"Delivered":"Sent"}>{m.deliveredAt||m.readAt?"✓✓":"✓"}</span>}</div>{!m.deleted && <ReactionBar message={m} userId={user.id} disabled={!connected || reacting !== null} onReact={reactToMessage}/>}</div></div></div>)}{messageSearch && !visibleMessages.length && <p className="no-results">No matching messages.</p>}<div ref={end}/></div>
      {error && <p className="error chat-error" role="alert">{error}</p>}
      <div className="composer-area">{emojiOpen && <div className="composer-emojis" role="group" aria-label="Insert emoji">{['😀','😄','😂','🥰','❤️','👍','🙏','🎉','👋','😡','😊','✨'].map(emoji => <button type="button" key={emoji} aria-label={`Insert ${emoji}`} onClick={() => insertEmoji(emoji)}>{emoji}</button>)}<button type="button" aria-label="Close emoji picker" onClick={() => setEmojiOpen(false)}>×</button></div>}
      <form className="composer" onSubmit={send}><input ref={mediaInput} hidden type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" aria-label="Choose photo or video" onChange={chooseAttachment}/><button type="button" className="attach-button" aria-label="Attach photo or video" title="Send a photo or video" disabled={!connected} onClick={() => mediaInput.current.click()}><Icon name="attach" size={22}/></button><button type="button" className="emoji-toggle" aria-label="Insert emoji" aria-expanded={emojiOpen} onClick={() => setEmojiOpen(v => !v)}><Icon name="smile" size={25}/></button><div className="composer-content"><textarea ref={composerInput} aria-label="Message" placeholder="Type a message" value={draft} onChange={e => setDraft(e.target.value)} maxLength={2000} rows={1} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && ['b','i'].includes(e.key.toLowerCase())) { e.preventDefault(); formatDraft(e.key.toLowerCase() === 'b' ? '**' : '*'); return; } if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(e); } }}/>{draft.includes('*') && <div className="format-preview"><span>Preview</span><p>{formatMessage(draft)}</p></div>}</div><button className="send-button" type="submit" disabled={!connected || !draft.trim() || busy} aria-label="Send message"><Icon name="send"/></button></form><footer className="composer-hint">Enter to send · Shift + Enter for a new line</footer></div>
    </> : <div className="welcome"><div className="welcome-illustration"><span className="illustration-chat"><Icon name="chat" size={76}/></span><span className="illustration-small">hello!</span><span className="illustration-dot one"/><span className="illustration-dot two"/></div><h1>Your conversations,<br/>a little closer.</h1><p>A private space for the people you know.<br/>Choose a conversation or add a new contact.</p><div className="welcome-features"><span>◉ Real-time messages</span><span>♡ Personal reactions</span></div><div className="welcome-line"><Icon name="laptop" size={17}/> Made for your everyday conversations</div>{error && <p className="error" role="alert">{error}</p>}</div>}</section>
  </main>{liveSocket&&<Calling user={user} peer={peer} connection={liveSocket}/>}{statusOpen&&<StatusPanel user={user} onClose={()=>setStatusOpen(false)}/ >}{photoOpen && <ProfilePhoto user={user} onClose={() => setPhotoOpen(false)} onSave={setUser}/>}{attachment && peer && <MediaUpload key={peer.id} file={attachment} recipient={peer} onClose={() => setAttachment(null)} onSent={receiveMessage}/>}</>;
}
