/** True on Apple platforms, where shortcuts use the Command key. */
export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

/**
 * Shortcut text for this platform. Write shortcuts in Mac notation ("⇧⌘S",
 * "⌘↵"); elsewhere they read "Ctrl+Shift+S", "Ctrl+Enter". Works on a whole
 * sentence that contains shortcuts too.
 */
export function kbd(text: string, mac: boolean = isMac): string {
  if (mac) return text
  return text.replaceAll('⇧⌘', 'Ctrl+Shift+').replaceAll('⌘', 'Ctrl+').replaceAll('⇧', 'Shift+').replaceAll('↵', 'Enter')
}
