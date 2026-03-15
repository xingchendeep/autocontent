/**
 * Creates a content snippet from input text.
 * Trims the input and takes the first 100 characters.
 * Returns empty string for null, undefined, or whitespace-only input.
 */
export function createSnippet(inputContent: string | null | undefined): string {
  const text = (inputContent ?? '').trim();
  if (text.length === 0) return '';
  return text.slice(0, 100);
}
