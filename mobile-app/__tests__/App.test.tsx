import {CHAT_URL, navigationAction} from '../src/navigation';
test('only the chat origin stays inside the authenticated WebView', () => {
 expect(navigationAction(CHAT_URL)).toBe('internal');
 expect(navigationAction(CHAT_URL + 'api/media/example?download=1')).toBe('internal');
 expect(navigationAction('https://salil-hello-chat.onrender.com.attacker.example/')).toBe('external');
 expect(navigationAction('https://example.com')).toBe('external');
 for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'intent://camera', 'http://example.com', 'https://user:password@salil-hello-chat.onrender.com/', 'bad url']) {
  expect(navigationAction(url)).toBe('blocked');
 }
});
