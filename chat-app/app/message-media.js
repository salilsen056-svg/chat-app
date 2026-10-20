'use client';
import { useState } from 'react';
export default function MessageMedia({ message }) {
  const [failed,setFailed]=useState(false);
  const src=`/api/media/${message.id}`;
  return <div className="message-media">
    {message.mediaType==='image' ? <a href={`${src}?download=1`} download={message.mediaName} aria-label="Download photo" title="Click to download photo"><img src={src} alt={message.text || 'Shared photo'} loading="lazy" onError={()=>setFailed(true)}/></a> : <video src={src} controls playsInline preload="metadata" onError={()=>setFailed(true)}/>}
    {failed && <p className="media-failed">Unable to display this file. Try opening or downloading it.</p>}
    <a className="media-download" href={`${src}?download=1`} download={message.mediaName}>Download {message.mediaType==='image'?'photo':'video'} ↧ · {(message.mediaSize/1024/1024).toFixed(1)} MB</a>
  </div>;
}
