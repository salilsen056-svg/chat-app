import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { applyFormat, formatMessage } from '../lib/formatting.mjs';
const render = text => renderToStaticMarkup(createElement('p', null, formatMessage(text)));
test('renders bold, italic, both, and ordinary text safely', () => {
  assert.equal(render('Hello **bold** and *italic* and ***both***'), '<p>Hello <strong>bold</strong> and <em>italic</em> and <strong><em>both</em></strong></p>');
  assert.equal(render('**<script>alert(1)</script>**'), '<p><strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong></p>');
  assert.equal(render('plain\ntext *unfinished'), '<p>plain\ntext *unfinished</p>');
});
test('selection formatting preserves surrounding text and toggles off', () => {
  const result = applyFormat('hello world', 6, 11, '**');
  assert.deepEqual(result, { text: 'hello **world**', start: 8, end: 13 });
  assert.deepEqual(applyFormat(result.text, result.start, result.end, '**'), { text: 'hello world', start: 6, end: 11 });
  assert.deepEqual(applyFormat('', 0, 0, '*'), { text: '*text*', start: 1, end: 5 });
});
