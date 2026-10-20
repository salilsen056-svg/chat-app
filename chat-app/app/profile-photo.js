'use client';
import { useEffect, useRef, useState } from 'react';
import Avatar from './avatar';
export default function ProfilePhoto({ user, onClose, onSave }) {
  const dialog = useRef(null), input = useRef(null);
  const [file, setFile] = useState(null), [preview, setPreview] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { dialog.current.showModal(); }, []);
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function select(e) {
    const next = e.target.files?.[0]; e.target.value = ''; if (!next) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(next.type) || next.size > 2 * 1024 * 1024) { setError('Choose a JPG, PNG or WebP photo smaller than 2 MB.'); return; }
    setError(''); setFile(next);
  }
  async function save(remove = false) {
    if (busy || (!remove && !file)) return; setBusy(true); setError('');
    try {
      const response = await fetch('/api/profile/photo', { method: remove ? 'DELETE' : 'POST', ...(!remove ? { headers: { 'Content-Type': file.type }, body: file } : {}) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      onSave(result.user); onClose();
    } catch(e) { setError(e.message || 'Unable to save photo.'); } finally { setBusy(false); }
  }
  return <dialog className="photo-dialog" ref={dialog} aria-labelledby="photo-title" onCancel={e => { if (busy) e.preventDefault(); else onClose(); }}>
    <button type="button" className="photo-close" aria-label="Close profile photo settings" disabled={busy} onClick={onClose}>×</button>
    <span className="eyebrow">MAKE IT YOURS</span><h2 id="photo-title">Your profile photo</h2><p>Add a little face to your hello.</p>
    <div className="photo-preview">{preview ? <img src={preview} alt="Selected profile photo preview"/> : <Avatar person={user} className="photo-large"/>}</div>
    <p className="photo-note">Circular photo · JPG, PNG or WebP · Up to 2 MB</p>
    <input ref={input} hidden type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose profile photo" onChange={select} disabled={busy}/>
    <button type="button" className="choose-photo" disabled={busy} onClick={() => input.current.click()}>{file ? 'Choose another photo' : 'Choose a photo'}</button>
    {error && <p className="error" role="alert">{error}</p>}
    <button type="button" className="primary" disabled={!file || busy} onClick={() => save()}>{busy ? 'Saving…' : 'Save profile photo'}</button>
    {user.avatarUrl && <button type="button" className="remove-photo" disabled={busy} onClick={() => save(true)}>Remove current photo</button>}
  </dialog>;
}
