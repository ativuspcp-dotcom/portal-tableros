import { bindHeaderEvents } from '../components/header.js';

/**
 * Simple hash-based SPA router
 */

const routes = {};
let currentRoute = null;
let beforeNavigate = null;

/**
 * Register a route
 */
export function route(path, handler) {
  routes[path] = handler;
}

/**
 * Set a guard that runs before every navigation
 */
export function setBeforeNavigate(fn) {
  beforeNavigate = fn;
}

/**
 * Navigate to a route
 */
export function navigate(path) {
  window.location.hash = path;
}

/**
 * Get current route
 */
export function getCurrentRoute() {
  return currentRoute;
}

const viewCache = new Map();

/**
 * Initialize router
 */
export function initRouter() {
  const app = document.getElementById('app');
  
  async function handleRoute() {
    const hash = window.location.hash.slice(1) || '/login';
    const path = hash.split('?')[0];

    // Run guard
    if (beforeNavigate) {
      const allowed = await beforeNavigate(path);
      if (!allowed) return;
    }

    const handler = routes[path];
    if (handler) {
      currentRoute = path;
      
      // Hide all cached views
      for (const view of viewCache.values()) {
        view.style.display = 'none';
      }

      if (viewCache.has(path)) {
        // Cache hit! Just show the existing view
        viewCache.get(path).style.display = 'block';
      } else {
        // Cache miss! Create a new container for this route
        const viewContainer = document.createElement('div');
        viewContainer.id = 'view-' + path.replaceAll('/', '-').replace(/^-/, '');
        viewContainer.className = 'route-view';
        viewContainer.style.display = 'block';
        
        app.appendChild(viewContainer);
        viewCache.set(path, viewContainer);

        // Run the handler, passing the new container so it renders inside it
        await handler(viewContainer);
      }
      
      // Bind header events globally for the active view
      bindHeaderEvents();
    } else {
      // 404 — redirect to dashboard
      navigate('/dashboard');
    }
  }

  window.addEventListener('hashchange', handleRoute);
  
  // Re-render entirely when the global branch (filial) changes
  window.addEventListener('branch_changed', async () => {
    // Clear all cached views because data is now stale
    for (const view of viewCache.values()) {
      if (view.parentNode) {
        view.parentNode.removeChild(view);
      }
    }
    viewCache.clear();
    
    // Re-render current route
    await handleRoute();
  });
  handleRoute();
}
