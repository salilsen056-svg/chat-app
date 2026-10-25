export const CHAT_URL = 'https://salil-hello-chat.onrender.com/';
export function navigationAction(value: string): 'internal' | 'external' | 'blocked' {
 try {
  const url = new URL(value);
  if (url.origin === new URL(CHAT_URL).origin && !url.username && !url.password) {return 'internal';}
  if (['https:', 'mailto:', 'tel:'].includes(url.protocol) && !url.username && !url.password) {return 'external';}
 } catch { /* Malformed URLs are never opened. */ }
 return 'blocked';
}
