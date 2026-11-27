import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

interface RewriteEvent {
  request: { uri: string };
}

function rewriteUri(uri: string): string {
  const event: RewriteEvent = { request: { uri } };
  const context = { event };
  const source = readFileSync(new URL('../lib/edge/spa-rewrite.js', import.meta.url), 'utf8');
  runInNewContext(`${source}\nhandler(event);`, context);
  return context.event.request.uri;
}

describe('SPA rewrite function', () => {
  it.each([
    ['/', '/index.html'],
    ['/admin/schools', '/index.html'],
    ['/a/b.c/d', '/index.html'],
    ['/assets/app-1a2b.js', '/assets/app-1a2b.js'],
    ['/favicon.ico', '/favicon.ico'],
  ])('rewrites %s to %s', (uri, expectedUri) => {
    expect(rewriteUri(uri)).toBe(expectedUri);
  });
});
