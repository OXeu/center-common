/** Leaves the current document for a consumer-declared authentication handoff. */
export function navigateDocument(url: string, reason: string): void {
  if (!reason.trim()) throw new Error('Document navigation requires an explicit reason')
  location.assign(url)
}
