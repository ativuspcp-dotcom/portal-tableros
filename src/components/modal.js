/**
 * Open a modal with given content
 */
export function openModal(title, bodyHTML, footerHTML = '', options = {}) {
  const overlay = document.getElementById('modal-overlay');
  const maxWidth = options.maxWidth || '560px';

  overlay.innerHTML = `
    <div class="modal" style="max-width: ${maxWidth}">
      <div class="modal-header">
        <h2 class="modal-title">${title}</h2>
        <button class="modal-close" id="modal-close-btn">✕</button>
      </div>
      <div class="modal-body">
        ${bodyHTML}
      </div>
      ${footerHTML ? `<div class="modal-footer">${footerHTML}</div>` : ''}
    </div>
  `;

  overlay.classList.add('active');

  // Close handler (only the X button)
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);

  // ESC key
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

/**
 * Close the modal
 */
export function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('active');
  overlay.innerHTML = '';
}

/**
 * Open a confirmation dialog
 */
export function confirmDialog(title, message, onConfirm, options = {}) {
  const type = options.type || 'danger';
  const confirmText = options.confirmText || 'Confirmar';
  const cancelText = options.cancelText || 'Cancelar';

  const icons = {
    danger: '⚠',
    warning: '⚠',
    info: 'ℹ'
  };

  const bodyHTML = `
    <div class="confirm-body">
      <div class="confirm-icon" style="${type === 'danger' ? '' : 'background: var(--color-warning-bg); color: var(--color-warning);'}">
        ${icons[type]}
      </div>
      <p>${message}</p>
    </div>
  `;

  const footerHTML = `
    <button class="btn btn-secondary" id="confirm-cancel">${cancelText}</button>
    <button class="btn btn-${type}" id="confirm-ok">${confirmText}</button>
  `;

  openModal(title, bodyHTML, footerHTML, { maxWidth: '420px' });

  document.getElementById('confirm-cancel').addEventListener('click', closeModal);
  document.getElementById('confirm-ok').addEventListener('click', () => {
    closeModal();
    onConfirm();
  });
}
