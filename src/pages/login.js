import { signIn } from '../auth/auth.js';
import { navigate } from '../utils/router.js';
import { showToast } from '../components/toast.js';

/**
 * Render login page
 */
export function renderLogin(container = document.getElementById('app')) {
  const app = container;

  app.innerHTML = `
    <div class="login-page">
      <div class="login-card">
        <div class="login-logo">
          <img src="/assets/logo-full.png" alt="Tableros" />
          <p class="login-subtitle">Sistema de Gestão Integrada</p>
        </div>

        <form class="login-form" id="login-form">
          <div id="login-error" style="display:none;"></div>

          <div class="form-group">
            <label class="form-label" for="login-email">E-mail</label>
            <div class="input-with-icon">
              <span class="input-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-mail"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
              </span>
              <input
                type="email"
                id="login-email"
                class="form-input"
                placeholder="seu@email.com"
                required
                autocomplete="email"
              />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="login-password">Senha</label>
            <div class="input-with-icon">
              <span class="input-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-lock"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              </span>
              <input
                type="password"
                id="login-password"
                class="form-input"
                placeholder="••••••••"
                required
                autocomplete="current-password"
              />
            </div>
          </div>

          <button type="submit" class="login-btn" id="login-btn">
            Entrar
          </button>
        </form>
      </div>
    </div>
  `;

  // Bind form
  document.getElementById('login-form').addEventListener('submit', handleLogin);
}

async function handleLogin(e) {
  e.preventDefault();

  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('login-btn');
  const errorDiv = document.getElementById('login-error');

  // Disable button
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  errorDiv.style.display = 'none';

  try {
    await signIn(email, password);
    showToast('Login realizado com sucesso!', 'success');
    navigate('/dashboard');
  } catch (error) {
    console.error('Login error:', error);
    let msg = 'E-mail ou senha incorretos.';
    if (error.message?.includes('Invalid login')) {
      msg = 'E-mail ou senha incorretos.';
    } else if (error.message?.includes('Email not confirmed')) {
      msg = 'E-mail não confirmado. Verifique sua caixa de entrada.';
    }

    errorDiv.innerHTML = `<div class="login-error">${msg}</div>`;
    errorDiv.style.display = 'block';

    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
}
