import './styles/index.css';
import { getCurrentSession, onAuthStateChange } from './auth/auth.js';
import { route, setBeforeNavigate, initRouter, navigate } from './utils/router.js';
import { hasModuleAccess, canManageUsers } from './utils/permissions.js';

// Pages
import { renderLogin } from './pages/login.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderUsers } from './pages/users.js';
import { renderProfile } from './pages/profile.js';
import { renderLogistica } from './pages/logistica.js';
import { renderExpedicao } from './pages/expedicao.js';
import { renderPCP } from './pages/pcp.js';
import { renderApontadores } from './pages/apontadores.js';

console.log('Portal Tableros: Main entry loaded.');

// Register routes
route('/login', renderLogin);
route('/dashboard', renderDashboard);
route('/users', renderUsers);
route('/profile', renderProfile);
route('/logistica', renderLogistica);
route('/expedicao', renderExpedicao);
route('/pcp', renderPCP);
route('/apontadores', renderApontadores);

// Set navigation guards
setBeforeNavigate(async (path) => {
  let session = null;
  try {
    session = await getCurrentSession();
  } catch (error) {
    console.error('Error getting session:', error);
  }

  const isAuthenticated = !!session?.profile;

  // 1. Unauthenticated users can only visit /login
  if (!isAuthenticated) {
    if (path !== '/login') {
      navigate('/login');
      return false; // Cancel navigation
    }
    return true; // Allow login path
  }

  // 2. Block app_tablet role from accessing anything in the portal
  if (session && session.profile?.role === 'app_tablet') {
    await supabase.auth.signOut();
    alert('Esta conta é restrita ao Aplicativo Móvel (Chão de Fábrica) e não tem acesso ao Portal.');
    window.location.href = '/login';
    return false;
  }

  // 3. Authenticated users going to /login should be redirected to dashboard
  if (path === '/login') {
    navigate('/dashboard');
    return false;
  }

  // 4. Permission checks for specific routes
  if (path === '/users' || path === '/apontadores') {
    if (!canManageUsers()) {
      navigate('/dashboard');
      return false;
    }
  }

  if (path === '/logistica') {
    if (!hasModuleAccess('logistica', 'can_view')) {
      navigate('/dashboard');
      return false;
    }
  }

  if (path === '/expedicao') {
    if (!hasModuleAccess('expedicao', 'can_view')) {
      navigate('/dashboard');
      return false;
    }
  }

  if (path === '/pcp') {
    if (!hasModuleAccess('pcp', 'can_view')) {
      navigate('/dashboard');
      return false;
    }
  }

  return true; // Allow navigation
});

// Boot the application
async function boot() {
  // Listen for auth state changes globally
  onAuthStateChange((event, session) => {
    const isLogin = window.location.hash.split('?')[0] === '#/login' || !window.location.hash;
    
    if (event === 'SIGNED_IN') {
      // Warm up the Vercel-to-Ngrok proxy connection to prevent the 8-second DNS penalty
      try {
        fetch("/api/Items?$top=1", { headers: { 'ngrok-skip-browser-warning': 'true' } }).catch(() => {});
      } catch (e) {}
      
      if (isLogin) {
        navigate('/dashboard');
      }
    } else if (event === 'SIGNED_OUT') {
      navigate('/login');
    }
  });

  // Initialize router
  initRouter();
}

boot().catch(err => console.error('Fatal boot error:', err));
