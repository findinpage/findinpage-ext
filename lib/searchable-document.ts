const SEARCHABLE_DOCUMENT_CONTENT_TYPES = new Set([
  'text/html',
  'application/xhtml+xml',
]);

export function isSearchableDocumentContentType(contentType: string): boolean {
  const normalizedContentType = contentType.split(';', 1)[0].trim().toLowerCase();
  return SEARCHABLE_DOCUMENT_CONTENT_TYPES.has(normalizedContentType);
}
