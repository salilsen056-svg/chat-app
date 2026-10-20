'use client';
import { useEffect, useRef, useState } from 'react';
const options = [{ emoji: '❤️', label: 'Love' }, { emoji: '👍', label: 'Like' }, { emoji: '😡', label: 'Angry' }, { emoji: '😄', label: 'Happy' }];

export default function ReactionBar({ message, userId, disabled, onReact }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  useEffect(() => {
    if (!open) return;
    const outside = e => { if (!root.current?.contains(e.target)) setOpen(false); };
    const escape = e => { if (e.key === 'Escape') { setOpen(false); root.current?.querySelector('.reaction-toggle')?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  function choose(emoji) { setOpen(false); onReact(message, emoji); }
  return <div className="reaction-bar" ref={root} role="group" aria-label="Message reactions">
    {options.map(({ emoji, label }) => {
      const count = Object.values(message.reactions || {}).filter(value => value === emoji).length;
      if (!count) return null;
      const selected = message.reactions?.[userId] === emoji;
      return <button type="button" key={label} className={selected ? 'reaction selected' : 'reaction'} aria-label={`${label}, ${count} reaction${count === 1 ? '' : 's'}`} aria-pressed={selected} title={selected ? `Remove ${label} reaction` : `React with ${label}`} disabled={disabled} onClick={() => choose(emoji)}><span>{emoji}</span><small>{count}</small></button>;
    })}
    <button className="reaction-toggle" type="button" aria-label="Choose a reaction" aria-expanded={open} disabled={disabled} onClick={() => setOpen(value => !value)}>React +</button>
    {open && <div className="reaction-picker" role="group" aria-label="Choose emoji">{options.map(({ emoji, label }) => <button key={label} type="button" className="reaction" aria-label={label} title={label} aria-pressed={message.reactions?.[userId] === emoji} disabled={disabled} onClick={() => choose(emoji)}>{emoji}</button>)}</div>}
  </div>;
}
