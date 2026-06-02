import { getCachedSession, getBPLID, setBPLID } from '../auth/auth.js';
import { getRoleLabel, getRoleBadgeClass } from '../utils/permissions.js';

const FILIAIS = {
  1: 'Tableros PAL',
  3: 'Tableros OTC',
  4: 'Tableros SFP'
};

/**
 * Render header
 */
export function renderHeader(title, breadcrumb = '') {
  const session = getCachedSession();
  const profile = session?.profile;
  const currentBPLID = getBPLID();

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    : 'U';

  const permitidas = profile?.filiais_permitidas || [1];
  
  const filialOptions = permitidas.map(id => {
    const nome = FILIAIS[id] || `Filial ${id}`;
    return `<option value="${id}" ${currentBPLID === id ? 'selected' : ''}>${nome}</option>`;
  }).join('');

  return `
    <header class="header">
      <div class="header-title">
        <h1>${title}</h1>
        ${breadcrumb ? `<div class="header-breadcrumb"><span>Portal</span> / ${breadcrumb}</div>` : ''}
      </div>
      <div class="header-actions" style="display: flex; align-items: center; gap: var(--space-4);">
        <select class="global-bplid-select" style="padding: 4px 8px; border-radius: 4px; border: 1px solid var(--color-border); font-size: var(--font-size-sm); background: var(--color-surface); cursor: pointer; color: var(--color-text);">
          ${filialOptions}
        </select>
        <span class="badge ${getRoleBadgeClass(profile?.role)}">${getRoleLabel(profile?.role)}</span>
        <div class="sidebar-user-avatar" style="width:32px;height:32px;font-size:12px;border-radius:999px;background:linear-gradient(135deg,var(--green-400),var(--green-600));display:flex;align-items:center;justify-content:center;color:white;font-weight:700;">${initials}</div>
      </div>
    </header>
  `;
}

// Use event delegation at the document level to avoid binding multiple times
// or missing the active view's select element.
let headerEventsBound = false;

export function bindHeaderEvents() {
  if (headerEventsBound) return;
  headerEventsBound = true;
  
  document.addEventListener('change', (e) => {
    if (e.target && e.target.classList.contains('global-bplid-select')) {
      setBPLID(e.target.value);
    }
  });
}
