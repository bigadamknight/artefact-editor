/**
 * Script injected into the preview iframe to bridge clicks back to the editor.
 * Walks up from the click target to the nearest [data-edit-id] ancestor.
 * Posts { type: "ae:select", blockId } to window.parent.
 */
export const previewBridgeScript = `
(function () {
  function findEditId(el) {
    while (el && el !== document.documentElement) {
      if (el.getAttribute && el.getAttribute('data-edit-id')) {
        return el.getAttribute('data-edit-id');
      }
      el = el.parentElement;
    }
    return null;
  }
  document.addEventListener('click', function (e) {
    var id = findEditId(e.target);
    if (id) {
      e.preventDefault();
      e.stopPropagation();
      window.parent.postMessage({ type: 'ae:select', blockId: id }, '*');
    }
  }, true);
  document.addEventListener('mouseover', function (e) {
    var id = findEditId(e.target);
    document.body.style.cursor = id ? 'pointer' : '';
  }, true);
  window.parent.postMessage({ type: 'ae:ready' }, '*');
})();
`;
