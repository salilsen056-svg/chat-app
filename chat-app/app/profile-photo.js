'use client';
import { useEffect, useRef, useState } from 'react';
import {cropRect} from '../lib/photo-crop.mjs';
import Avatar from './avatar';
export default function ProfilePhoto({ user, onClose, onSave }) {
  const dialog = useRef(null), input = useRef(null), canvas=useRef(null), source=useRef(null);
  const [file, setFile] = useState(null), [preview, setPreview] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [zoom,setZoom]=useState(1),[positionX,setPositionX]=useState(.5),[positionY,setPositionY]=useState(.5),[imageReady,setImageReady]=useState(false);
  useEffect(() => { dialog.current.showModal(); }, []);
  useEffect(()=>{if(!preview)return;let active=true;setImageReady(false);const image=new Image();image.onload=()=>{if(!active)return;if(image.width*image.height>16000000){setError('Choose a photo up to 16 megapixels.');return;}source.current=image;setImageReady(true);};image.onerror=()=>{if(active)setError('Unable to open this photo.');};image.src=preview;return()=>{active=false;source.current=null;};},[preview]);
  useEffect(()=>{if(!imageReady||!canvas.current||!source.current)return;const image=source.current,{sx,sy,size}=cropRect(image.width,image.height,zoom,positionX,positionY);const ctx=canvas.current.getContext('2d');ctx.fillStyle='#edf1e6';ctx.fillRect(0,0,512,512);ctx.drawImage(image,sx,sy,size,size,0,0,512,512);},[imageReady,zoom,positionX,positionY]);
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function select(e) {
    const next = e.target.files?.[0]; e.target.value = ''; if (!next) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(next.type) || next.size > 2 * 1024 * 1024) { setError('Choose a JPG, PNG or WebP photo smaller than 2 MB.'); return; }
    setError('');setImageReady(false);setZoom(1);setPositionX(.5);setPositionY(.5);setFile(next);
  }
  async function save(remove = false) {
    if (busy || (!remove && !file)) return; setBusy(true); setError('');
    try {
      let photo;
      if(!remove){if(!imageReady)throw Error('Wait for the photo preview.');photo=await new Promise(resolve=>canvas.current.toBlob(resolve,'image/jpeg',.9));if(!photo)throw Error('Unable to prepare this photo.');}
      const response = await fetch('/api/profile/photo', { method: remove ? 'DELETE' : 'POST', ...(!remove ? { headers: { 'Content-Type': 'image/jpeg' }, body: photo } : {}) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      onSave(result.user); onClose();
    } catch(e) { setError(e.message || 'Unable to save photo.'); } finally { setBusy(false); }
  }
  return <dialog className="photo-dialog" ref={dialog} aria-labelledby="photo-title" onCancel={e => { if (busy) e.preventDefault(); else onClose(); }}>
    <button type="button" className="photo-close" aria-label="Close profile photo settings" disabled={busy} onClick={onClose}>×</button>
    <span className="eyebrow">MAKE IT YOURS</span><h2 id="photo-title">Your profile photo</h2><p>Add a little face to your hello.</p>
    <div className="photo-preview">{preview ? <canvas ref={canvas} width={512} height={512} className="photo-crop" aria-label="Cropped profile photo preview"/> : <Avatar person={user} className="photo-large"/>}</div>
    {preview&&<div className="photo-adjustments"><label>Zoom<input aria-label="Photo zoom" type="range" min="1" max="3" step=".01" value={zoom} disabled={busy||!imageReady} onChange={e=>setZoom(Number(e.target.value))}/></label><label>Left / right<input aria-label="Photo horizontal position" type="range" min="0" max="1" step=".01" value={positionX} disabled={busy||!imageReady} onChange={e=>setPositionX(Number(e.target.value))}/></label><label>Up / down<input aria-label="Photo vertical position" type="range" min="0" max="1" step=".01" value={positionY} disabled={busy||!imageReady} onChange={e=>setPositionY(Number(e.target.value))}/></label></div>}
    <p className="photo-note">Circular photo · JPG, PNG or WebP · Up to 2 MB</p>
    <input ref={input} hidden type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose profile photo" onChange={select} disabled={busy}/>
    <button type="button" className="choose-photo" disabled={busy} onClick={() => input.current.click()}>{file ? 'Choose another photo' : 'Choose a photo'}</button>
    {error && <p className="error" role="alert">{error}</p>}
    <button type="button" className="primary" disabled={!file || !imageReady || busy} onClick={() => save()}>{busy ? 'Saving…' : 'Save profile photo'}</button>
    {user.avatarUrl && <button type="button" className="remove-photo" disabled={busy} onClick={() => save(true)}>Remove current photo</button>}
  </dialog>;
}
