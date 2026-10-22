'use client';
import { useEffect, useRef, useState } from 'react';
export default function MediaUpload({ file, recipient, onClose, onSent }) {
  const dialog=useRef(null),[url,setUrl]=useState(''),[caption,setCaption]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{dialog.current.showModal();const objectUrl=URL.createObjectURL(file);setUrl(objectUrl);return()=>URL.revokeObjectURL(objectUrl);},[file]);
  async function submit(e) {
    e.preventDefault();if(busy)return;setBusy(true);setError('');
    try {
      const data=new FormData();data.append('file',file);data.append('caption',caption);
      const response=await fetch(`/api/messages/media?to=${recipient.id}`,{method:'POST',body:data});
      const result=await response.json();if(!response.ok)throw new Error(result.error || 'Unable to send media.');
      onSent(result.message);onClose();
    }catch(e){setError(e.message || 'Upload failed. Please try again.');}finally{setBusy(false);}
  }
  return <dialog ref={dialog} className="media-dialog" aria-labelledby="media-title" onCancel={e=>{if(busy)e.preventDefault();else onClose();}}>
    <div className="media-dialog-header"><h2 id="media-title">Send {file.type.startsWith('image/')?'photo':file.type.startsWith('audio/')?'voice recording':'video'}</h2><button type="button" aria-label="Cancel attachment" disabled={busy} onClick={onClose}>×</button></div>
    <p className="media-recipient">To {recipient.name} · {(file.size/1024/1024).toFixed(1)} MB</p>
    <div className="upload-preview">{url && (file.type.startsWith('image/')?<img src={url} alt="Photo attachment preview"/>:file.type.startsWith('audio/')?<audio src={url} controls preload="metadata"/>:<video src={url} controls playsInline preload="metadata"/>)}</div>
    <form onSubmit={submit}><label>Caption (optional)<textarea aria-label="Attachment caption" placeholder="Add a caption…" value={caption} onChange={e=>setCaption(e.target.value)} maxLength={2000} disabled={busy}/></label>
      {error && <p className="error" role="alert">{error}</p>}<p className="media-upload-note">Photos up to 10 MB · MP4/WebM videos up to 30 MB</p><button type="submit" className="primary" disabled={busy}>{busy?'Uploading and sending…':'Send attachment →'}</button>
    </form>
  </dialog>;
}
