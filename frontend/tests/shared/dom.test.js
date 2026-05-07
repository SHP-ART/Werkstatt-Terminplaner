import { describe, expect, it, vi } from 'vitest';
import { bindEventListenerOnce, escapeHtml, escapeSelector, setTextIfExists } from '../../src/shared/dom.js';

describe('shared dom helpers', () => {
  it('escapes html text', () => {
    expect(escapeHtml('<b>"x"&</b>')).toBe('&lt;b&gt;&quot;x&quot;&amp;&lt;/b&gt;');
  });

  it('sets text only when element exists', () => {
    document.body.innerHTML = '<div id="target"></div>';
    expect(setTextIfExists('target', 'Hallo')).toBe(true);
    expect(document.getElementById('target').textContent).toBe('Hallo');
    expect(setTextIfExists('missing', 'Noop')).toBe(false);
  });

  it('binds the same listener only once per key', () => {
    document.body.innerHTML = '<button id="btn"></button>';
    const button = document.getElementById('btn');
    const handler = vi.fn();
    bindEventListenerOnce(button, 'click', handler, 'Save');
    bindEventListenerOnce(button, 'click', handler, 'Save');
    button.click();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('escapes selectors through CSS.escape when available', () => {
    expect(escapeSelector('abc')).toBe('abc');
  });
});
