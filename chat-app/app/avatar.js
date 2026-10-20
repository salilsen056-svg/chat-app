'use client';
import { useState } from 'react';
export default function Avatar({ person, className = '' }) {
  const [failedUrl, setFailedUrl] = useState(null);
  return <span className={`avatar ${className}`}>{person.avatarUrl && person.avatarUrl !== failedUrl ? <img src={person.avatarUrl} alt={`${person.name}'s profile photo`} onError={() => setFailedUrl(person.avatarUrl)}/> : person.name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()}</span>;
}
