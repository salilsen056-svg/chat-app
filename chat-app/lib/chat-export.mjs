export function exportLine(message) {
  const name=String(message.senderName || 'User').replace(/[\r\n]/g,' ');
  const time=new Date(message.createdAt).toISOString();
  if(message.deleted)return `[${time}] ${name}: This message was deleted\n\n`;
  const attachment=message.mediaType ? `\n[${message.mediaType==='image'?'Photo':'Video'}: ${message.mediaName}, ${message.mediaSize} bytes; download separately from the chat]` : '';
  return `[${time}] ${name}: ${message.text || ''}${attachment}\n\n`;
}
