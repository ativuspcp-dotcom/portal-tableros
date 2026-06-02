/**
 * Show a toast notification
 */
export function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icons = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
    warning: '⚠'
  };

  toast.innerHTML = `
    <span style="font-size: 16px; font-weight: bold;">${icons[type] || 'ℹ'}</span>
    <span class="toast-message">${message}</span>
    <span class="toast-close" onclick="this.parentElement.classList.add('hiding'); setTimeout(() => this.parentElement.remove(), 300)">✕</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}
