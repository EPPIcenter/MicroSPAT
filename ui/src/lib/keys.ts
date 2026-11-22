/**
 * Guards for page keyboard shortcuts (handled on `window`): skip them while
 * the user types, and while an overlay (dialog, menu, an open select or
 * popup list) has the keyboard.
 */

/** A text field, text area, select or editable element: keys there are text, not shortcuts. Checkboxes, radios and buttons are not typing. */
export function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false
  if (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true
  return t.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes((t as HTMLInputElement).type)
}

// Only overlays: a page's own list boxes (a locus list, a class list) are always there and must not block its shortcuts.
const OVERLAYS = '[role=dialog],[role=alertdialog],[role=menu],[data-radix-popper-content-wrapper] [role=listbox],[data-radix-select-viewport]'

/** A dialog, menu or popup list is open. */
export function overlayOpen(): boolean {
  return document.querySelector(OVERLAYS) != null
}

/** True when a page shortcut should not act on this key event. */
export function shortcutBlocked(e: KeyboardEvent): boolean {
  return e.defaultPrevented || isTypingTarget(e.target) || overlayOpen()
}
