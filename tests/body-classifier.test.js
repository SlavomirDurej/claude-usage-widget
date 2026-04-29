import { describe, it, expect } from 'vitest';
import { classifyBody } from '../src/body-classifier.js';

describe('classifyBody', () => {
  it('parses valid JSON', () => {
    const result = classifyBody('{"foo": 1, "bar": ["a", "b"]}');
    expect(result).toEqual({
      kind: 'json',
      payload: { foo: 1, bar: ['a', 'b'] },
    });
  });

  it('detects Cloudflare "Just a moment" block', () => {
    const body = 'Just a moment...\nVerifying you are human.';
    const result = classifyBody(body);
    expect(result.kind).toBe('cloudflare-blocked');
    expect(result.errorTag).toBe('CloudflareBlocked');
    expect(result.snippet).toBe(body.substring(0, 200));
  });

  it('detects Cloudflare JS-and-cookies challenge', () => {
    const body = 'Enable JavaScript and cookies to continue.';
    const result = classifyBody(body);
    expect(result.kind).toBe('cloudflare-challenge');
    expect(result.errorTag).toBe('CloudflareChallenge');
  });

  it('detects unexpected HTML responses', () => {
    const body = '<html><body>oops</body></html>';
    const result = classifyBody(body);
    expect(result.kind).toBe('unexpected-html');
    expect(result.errorTag).toBe('UnexpectedHTML');
  });

  it('flags garbage non-JSON as invalid-json', () => {
    const body = 'this is not json at all';
    const result = classifyBody(body);
    expect(result.kind).toBe('invalid-json');
    expect(result.snippet).toBe(body.substring(0, 200));
  });

  it('flags empty body as invalid-json', () => {
    const result = classifyBody('');
    expect(result.kind).toBe('invalid-json');
  });

  it('truncates snippets to 200 chars', () => {
    const body = 'x'.repeat(500);
    const result = classifyBody(body);
    expect(result.snippet.length).toBe(200);
  });

  it('checks signatures before attempting JSON parse', () => {
    // If the body matches a signature pattern, that wins — even if the rest
    // happens to be valid JSON. Locks in current order-of-checks behavior.
    const body = '{"junk": "Just a moment"}';
    const result = classifyBody(body);
    expect(result.kind).toBe('cloudflare-blocked');
  });
});
