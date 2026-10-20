import { describe, expect, it } from 'vitest';
import { isSearchableDocumentContentType } from './searchable-document';

describe('isSearchableDocumentContentType', () => {
  it.each([
    'text/html',
    'TEXT/HTML',
    'text/html; charset=utf-8',
    'application/xhtml+xml',
  ])('allows searchable document type %s', (contentType) => {
    expect(isSearchableDocumentContentType(contentType)).toBe(true);
  });

  it.each([
    'audio/mpeg',
    'audio/ogg',
    'video/mp4',
    'image/png',
    'application/pdf',
    '',
  ])('rejects non-searchable document type %s', (contentType) => {
    expect(isSearchableDocumentContentType(contentType)).toBe(false);
  });
});
