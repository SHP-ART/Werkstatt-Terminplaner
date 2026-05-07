import { escapeHtml } from './dom.js';

export function showToast(message, type = 'info') {
  let toastContainer = document.getElementById('toastContainer');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toastContainer';
    toastContainer.className = 'toast-container';
    toastContainer.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 10000; display: flex; flex-direction: column; gap: 10px;';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.className = 'toast';
  const colors = {
    success: { bg: '#4caf50', icon: '✅' },
    error: { bg: '#f44336', icon: '❌' },
    warning: { bg: '#ff9800', icon: '⚠️' },
    info: { bg: '#2196f3', icon: 'ℹ️' }
  };
  const color = colors[type] || colors.info;

  toast.style.cssText = `
    background: ${color.bg}; color: white; padding: 15px 20px; border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2); display: flex; align-items: center; gap: 10px;
    font-size: 14px; font-weight: 500; animation: slideIn 0.3s ease-out;
    max-width: 350px; word-wrap: break-word;
  `;
  toast.innerHTML = `<span>${color.icon}</span><span>${escapeHtml(message)}</span>`;

  if (!document.getElementById('toastAnimationStyle')) {
    const style = document.createElement('style');
    style.id = 'toastAnimationStyle';
    style.textContent = `
      @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
    `;
    document.head.appendChild(style);
  }

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-out forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);

  return toast;
}
