import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js';
import { renderHeader } from '../components/header.js';
import { montarRq03Laminacao } from './qualidade/rq03-laminacao.js';

// Estrutura do módulo: Registros > Setor > RQ. Para incluir um setor ou RQ, basta editar aqui.
const REGISTROS_SETORES = [
  { slug: 'laminacao', label: 'Laminação', rqs: ['RQ01', 'RQ02', 'RQ03'] },
  { slug: 'secagem', label: 'Secagem', rqs: ['RQ04', 'RQ16'] },
  { slug: 'colagem', label: 'Colagem', rqs: ['RQ05', 'RQ06', 'RQ07', 'RQ08'] },
  { slug: 'prensa', label: 'Prensa', rqs: ['RQ09'] },
  { slug: 'esquadrejadeira', label: 'Esquadrejadeira', rqs: ['RQ10'] },
  { slug: 'calibradeira', label: 'Calibradeira', rqs: ['RQ12'] },
  { slug: 'fresadeira', label: 'Fresadeira', rqs: ['RQ13'] },
  { slug: 'placagem', label: 'Placagem', rqs: ['RQ28'] },
  { slug: 'amarracao', label: 'Amarração', rqs: ['RQ17'] }
];

const MAIN_TABS = [{ slug: 'registros', label: 'Registros' }];

function lerEstado(chave, validos, padrao) {
  const salvo = sessionStorage.getItem(chave);
  return validos.includes(salvo) ? salvo : padrao;
}

let activeMainTab = lerEstado('qualidadeActiveMainTab', MAIN_TABS.map(t => t.slug), 'registros');
let activeSetor = lerEstado('qualidadeActiveSetor', REGISTROS_SETORES.map(s => s.slug), REGISTROS_SETORES[0].slug);
let activeRq = sessionStorage.getItem('qualidadeActiveRq');

function setorAtual() {
  return REGISTROS_SETORES.find(s => s.slug === activeSetor) || REGISTROS_SETORES[0];
}

// Garante que o RQ selecionado pertence ao setor ativo (senão cai no primeiro do setor).
function rqAtual() {
  const { rqs } = setorAtual();
  return rqs.includes(activeRq) ? activeRq : rqs[0];
}

function tabButton({ cls, dataAttr, value, label, active, level }) {
  const estilo = level === 1
    ? `padding: var(--space-2) var(--space-4); border-radius: var(--radius-md) var(--radius-md) 0 0; font-weight: var(--font-weight-semibold); border: 1px solid ${active ? 'var(--color-border)' : 'transparent'}; border-bottom: 1px solid ${active ? 'var(--color-surface)' : 'transparent'}; color: ${active ? 'var(--color-primary)' : 'var(--color-text-secondary)'}; background: ${active ? 'var(--color-surface)' : 'transparent'}; margin-bottom: -1px; font-size: var(--font-size-base); transition: all var(--transition-fast);`
    : `font-size: var(${level === 2 ? '--font-size-sm' : '--font-size-xs'}); font-weight: ${active ? '600' : '400'}; color: ${active ? 'var(--color-primary)' : 'var(--color-text-secondary)'}; border: none; background: transparent; border-bottom: 2px solid ${active ? 'var(--color-primary)' : 'transparent'}; padding-bottom: 4px; transition: all var(--transition-fast);`;
  return `<button class="${cls} ${active ? 'active' : ''}" ${dataAttr}="${value}" style="${estilo}">${label}</button>`;
}

/**
 * Render Qualidade page
 */
export async function renderQualidade(container = document.getElementById('view-qualidade') || document.getElementById('app')) {
  const setor = setorAtual();
  const rq = rqAtual();

  container.innerHTML = `
    <div class="app-layout">
      ${renderSidebar()}
      <div class="main-content">
        ${renderHeader('Qualidade', 'Módulos')}
        <div class="page-content" style="padding-top: var(--space-4);">

          <div class="qualidade-primary-tabs" style="display: flex; gap: var(--space-1); margin-bottom: var(--space-4); border-bottom: 1px solid var(--color-border); padding-bottom: 0;">
            ${MAIN_TABS.map(t => tabButton({ cls: 'qualidade-main-tab-btn', dataAttr: 'data-tab', value: t.slug, label: t.label, active: activeMainTab === t.slug, level: 1 })).join('')}
          </div>

          ${activeMainTab === 'registros' ? `
            <div class="qualidade-sub-tabs" style="display: flex; gap: var(--space-4); margin-bottom: var(--space-4); border-bottom: 1px solid var(--color-border-light); padding-bottom: var(--space-2); padding-left: var(--space-2); overflow-x: auto; white-space: nowrap;">
              ${REGISTROS_SETORES.map(s => tabButton({ cls: 'qualidade-setor-tab-btn', dataAttr: 'data-setor', value: s.slug, label: s.label, active: activeSetor === s.slug, level: 2 })).join('')}
            </div>
            <div class="qualidade-rq-tabs" style="display: flex; gap: var(--space-4); margin: calc(-1 * var(--space-2)) 0 var(--space-4); padding-left: var(--space-6);">
              ${setor.rqs.map(r => tabButton({ cls: 'qualidade-rq-tab-btn', dataAttr: 'data-rq', value: r, label: r, active: rq === r, level: 3 })).join('')}
            </div>

            <div id="qualidade-tab-content">
              <div class="card" style="padding: var(--space-8); text-align: center; color: var(--color-text-secondary);">
                <strong>${setor.label} › ${rq}</strong><br>
                Registro em desenvolvimento.
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;

  bindSidebarEvents();
  bindQualidadeEvents();

  // Telas dos RQs já construídas; os demais seguem como placeholder
  if (activeMainTab === 'registros' && setor.slug === 'laminacao' && rq === 'RQ03') {
    montarRq03Laminacao(document.getElementById('qualidade-tab-content'));
  }
}

function bindQualidadeEvents() {
  document.querySelectorAll('.qualidade-main-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab === activeMainTab) return;
      activeMainTab = btn.dataset.tab;
      sessionStorage.setItem('qualidadeActiveMainTab', activeMainTab);
      renderQualidade();
    });
  });

  document.querySelectorAll('.qualidade-setor-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.setor === activeSetor) return;
      activeSetor = btn.dataset.setor;
      activeRq = setorAtual().rqs[0];
      sessionStorage.setItem('qualidadeActiveSetor', activeSetor);
      sessionStorage.setItem('qualidadeActiveRq', activeRq);
      renderQualidade();
    });
  });

  document.querySelectorAll('.qualidade-rq-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.rq === rqAtual()) return;
      activeRq = btn.dataset.rq;
      sessionStorage.setItem('qualidadeActiveRq', activeRq);
      renderQualidade();
    });
  });
}
