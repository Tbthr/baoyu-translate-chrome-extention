const ATTR_NAME = 'data-baoyu-id';

/**
 * Assigns a unique ID to an element via the data-baoyu-id attribute.
 * If the element already has an ID, it will be replaced with a new one.
 */
export function tagElement(el: HTMLElement): string {
  const id = crypto.randomUUID();
  el.setAttribute(ATTR_NAME, id);
  return id;
}

/**
 * Finds an element by its data-baoyu-id attribute value.
 * Returns null if no matching element is found.
 */
export function findTaggedElement(id: string): HTMLElement | null {
  return document.querySelector(`[${ATTR_NAME}="${id}"]`) as HTMLElement | null;
}

/**
 * Removes all data-baoyu-id attributes from the document.
 * Also unwraps any text-node wrapper spans created by the extractor.
 */
export function cleanupAllTags(): void {
  document.querySelectorAll(`[${ATTR_NAME}]`).forEach((el) => {
    el.removeAttribute(ATTR_NAME);
  });

  // Unwrap <span class="baoyu-text-wrapper"> elements, preserving text content
  document.querySelectorAll('.baoyu-text-wrapper').forEach((span) => {
    const parent = span.parentNode;
    while (span.firstChild) {
      parent?.insertBefore(span.firstChild, span);
    }
    span.remove();
  });
}
