'use client';
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { applyFormat, formatMessage } from '../lib/formatting.mjs';
const reactionOptions = [{ emoji: '❤️', label: 'Love' }, { emoji: '👍', label: 'Like' }, { emoji: '😡', label: 'Angry' }, { emoji: '😄', label: 'Happy' }];
const initials = name => name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
async function api(path, data) {
  const response = await fetch(`/api/${path}`, data ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {});
  const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
}
export default function Home() {
  const [user, setUser] = useState(null), [loading, setLoading] = useState(true), [signup, setSignup] = useState(false);
  const [users, setUsers] = useState([]), [peer, setPeer] = useState(null), [messages, setMessages] = useState([]);
  const [search, setSearch] = useState(''), [draft, setDraft] = useState(''), [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [connected, setConnected] = useState(false), [historyLoading, setHistoryLoading] = useState(false);
  const composerInput = useRef(null), reactionUpdates = useRef(new Map());
  const [reacting, setReacting] = useState(null);
  const socket = useRef(null), end = useRef(null), active = useRef(null), deletedIds = useRef(new Set());
  const [deleting, setDeleting] = useState(null);
  useEffect(() => { api('me').then(r => setUser(r.user)).catch(e => { if (e.message !== 'Please sign in.') setError(e.message); }).finally(() => setLoading(false)); }, []);
  useEffect(() => {
    if (!user) return;
    const refresh = () => api('users').then(r => setUsers(r.users)).catch(e => setError(e.message)); refresh();
    const timer = setInterval(refresh, 15000);
    const s = io(); socket.current = s;
    s.on('connect', () => setConnected(true)); s.on('disconnect', () => setConnected(false));
    s.on('connect_error', e => { setConnected(false); setError(e.message); });
    s.on('message:reactions', updateReactions);
    s.on('message:deleted', m => { deletedIds.current.add(m.id); setMessages(prev => prev.map(item => item.id === m.id ? { ...item, text: undefined, deleted: true, reactions: {} } : item)); });
    s.on('message:new', m => { if (m.from === active.current || m.to === active.current) setMessages(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m]); });
    return () => { clearInterval(timer); s.disconnect(); socket.current = null; };
  }, [user]);
  useEffect(() => {
    active.current = peer?.id; setMessages([]); setDraft(''); if (!peer) return;
    let ignore = false; setHistoryLoading(true); setError('');
    api(`messages?with=${peer.id}`).then(r => { if (!ignore) setMessages(prev => { const unique = new Map([...r.messages, ...prev].map(m => { const update = reactionUpdates.current.get(m.id); const current = update && update.reactionVersion > (m.reactionVersion || 0) ? { ...m, ...update } : m; return [m.id, deletedIds.current.has(m.id) ? { ...current, text: undefined, deleted: true, reactions: {} } : current]; })); return [...unique.values()].sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt)); }); }).catch(e => { if (!ignore) setError(e.message); }).finally(() => { if (!ignore) setHistoryLoading(false); });
    return () => { ignore = true; };
  }, [peer]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
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
  function deleteMessage(id) {
    if (!connected || deleting) return;
    setDeleting(id); setError('');
    socket.current.timeout(10000).emit('message:delete', { id }, (err, result) => {
      setDeleting(null);
      if (err || result?.error) setError(result?.error || 'Deletion could not be confirmed. Please try again.');
      else { deletedIds.current.add(id); setMessages(prev => prev.map(m => m.id === id ? { ...m, text: undefined, deleted: true, reactions: {} } : m)); }
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
  function send(event) {
    event.preventDefault(); if (!draft.trim() || !peer || !connected || busy) return;
    setBusy(true); setError(''); const text = draft;
    socket.current.timeout(10000).emit('message:send', { to: peer.id, text }, (err, result) => { setBusy(false); if (err || result?.error) setError(result?.error || 'Delivery could not be confirmed. Check your conversation before retrying.'); else setDraft(current => current === text ? '' : current); });
  }
  if (loading) return <div className="loading"><span className="brand">hello<span>✳</span></span><p>Opening your space…</p></div>;
  if (!user) return <main className="auth-shell"><section className="intro"><a className="brand" href="/">hello<span>✳</span></a><div><span className="eyebrow">GOOD CONVERSATIONS START HERE</span><h1>A little hello.<br/>A lot closer.</h1><p>Your people, just a message away.<br/>A simple space for everyday conversations.</p><div className="art"><div className="art-message">Hey, how’s your day going? <span>10:24</span></div><div className="art-message reply">Better now that you’re here ✨ <span>10:25</span></div><div className="art-spark">✳</div></div></div><span className="intro-foot">Small moments. Real connections.</span></section><section className="auth"><div className="auth-card"><span className="eyebrow">YOUR NEXT CONVERSATION AWAITS</span><h2>{signup ? 'Make yourself at home.' : 'Welcome back.'}</h2><p>{signup ? 'Create an account and say your first hello.' : 'Sign in to pick up where you left off.'}</p><form onSubmit={auth}>{signup && <label>Your name<input name="name" autoComplete="name" required maxLength={60} placeholder="Alex Morgan"/></label>}<label>Email address<input type="email" name="email" autoComplete="email" required placeholder="you@example.com"/></label><label>Password<input type="password" name="password" autoComplete={signup ? 'new-password' : 'current-password'} minLength={8} maxLength={128} required placeholder="At least 8 characters"/></label>{error && <p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy ? 'One moment…' : signup ? 'Create account →' : 'Sign in →'}</button></form><p className="switch">{signup ? 'Already have an account?' : 'New around here?'} <button onClick={() => { setSignup(!signup); setError(''); }}>{signup ? 'Sign in' : 'Create an account'}</button></p><div className="privacy">◈ &nbsp; Your conversations. Your space.</div></div></section></main>;
  return <main className={`chat-shell ${peer ? 'has-peer' : ''}`}><aside className="sidebar"><div className="sidebar-top"><a className="brand" href="/">hello<span>✳</span></a><span className="pill">PERSONAL</span></div><div className="section-title"><h2>Messages</h2><span>{users.length}</span></div><label className="search"><span>⌕</span><input aria-label="Search people" placeholder="Find your people" value={search} onChange={e => setSearch(e.target.value)}/></label><div className="people">{users.filter(u => `${u.name} ${u.email}`.toLowerCase().includes(search.toLowerCase())).map((u,i) => <button key={u.id} className={`person ${peer?.id === u.id ? 'selected' : ''}`} onClick={() => setPeer(u)}><span className={`avatar color-${i % 4}`}>{initials(u.name)}</span><span className="person-info"><strong>{u.name}</strong><span>Start a conversation</span></span><span className="chevron">›</span></button>)}{users.length === 0 && <p className="empty-list">It’s quiet here. Ask a friend to create an account to start chatting.</p>}</div><div className="profile"><span className="avatar">{initials(user.name)}</span><div><strong>{user.name}</strong><span><i className={connected ? 'online' : ''}/> {connected ? 'Connected' : 'Reconnecting…'}</span></div><button onClick={logout} aria-label="Sign out" title="Sign out">↪</button></div></aside><section className="conversation">{peer ? <><header className="chat-header"><button className="back" aria-label="Back to people" onClick={() => setPeer(null)}>←</button><span className="avatar">{initials(peer.name)}</span><div><h2>{peer.name}</h2><p>{peer.email}</p></div><span className="header-note">ONE-TO-ONE CHAT</span></header><div className="messages"><div className="conversation-start"><span className="avatar large">{initials(peer.name)}</span><h3>This is the start of something.</h3><p>Say hello to {peer.name.split(' ')[0]}.</p></div>{historyLoading && <p className="history-loading">Loading conversation…</p>}{messages.map(m => <div key={m.id} className={`message-row ${m.from === user.id ? 'mine' : ''}`}><div className="bubble"><p className={m.deleted ? 'deleted-text' : undefined}>{m.deleted ? 'This message was deleted' : formatMessage(m.text)}</p>{m.from === user.id && !m.deleted && <button type="button" className="delete-message" disabled={!connected || deleting !== null} onClick={() => deleteMessage(m.id)}>{deleting === m.id ? 'Deleting…' : 'Delete for everyone'}</button>}<time>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>{!m.deleted && <div className="reaction-bar" role="group" aria-label="Message reactions">{reactionOptions.map(({ emoji, label }) => { const count = Object.values(m.reactions || {}).filter(value => value === emoji).length; const selected = m.reactions?.[user.id] === emoji; return <button type="button" key={label} className={selected ? 'reaction selected' : 'reaction'} aria-label={`${label}${count ? `, ${count} reaction${count === 1 ? '' : 's'}` : ''}`} aria-pressed={selected} title={selected ? `Remove ${label} reaction` : label} disabled={!connected || reacting !== null} onClick={() => reactToMessage(m, emoji)}><span>{emoji}</span>{count > 0 && <small>{count}</small>}</button>; })}</div>}</div></div>)}<div ref={end}/></div>{error && <p className="error chat-error" role="alert">{error}</p>}<form className="composer" onSubmit={send}><div className="composer-content"><div className="format-toolbar" role="toolbar" aria-label="Text formatting"><button type="button" onMouseDown={e => e.preventDefault()} onClick={() => formatDraft('**')} aria-label="Bold" title="Bold (Ctrl/⌘ + B)"><strong>B</strong></button><button type="button" onMouseDown={e => e.preventDefault()} onClick={() => formatDraft('*')} aria-label="Italic" title="Italic (Ctrl/⌘ + I)"><em>I</em></button><span>Select text to format</span></div><textarea ref={composerInput} aria-label="Message" placeholder={`Message ${peer.name.split(' ')[0]}…`} value={draft} onChange={e => setDraft(e.target.value)} maxLength={2000} rows={1} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && ['b', 'i'].includes(e.key.toLowerCase())) { e.preventDefault(); formatDraft(e.key.toLowerCase() === 'b' ? '**' : '*'); return; } if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(e); } }}/>{draft.trim() && <div className="format-preview"><span>Preview</span><p>{formatMessage(draft)}</p></div>}</div><button type="submit" disabled={!connected || !draft.trim() || busy} aria-label="Send message">↑</button></form><footer className="composer-hint">Enter to send · Shift + Enter for a new line</footer></> : <div className="welcome"><div className="welcome-icon">✳</div><span className="eyebrow">A SPACE FOR YOUR PEOPLE</span><h1>Good things start<br/>with a hello.</h1><p>Choose someone from the sidebar<br/>and make their day a little brighter.</p><span className="welcome-line">← &nbsp; Your next conversation is right here</span>{error && <p className="error" role="alert">{error}</p>}</div>}</section></main>;
}
