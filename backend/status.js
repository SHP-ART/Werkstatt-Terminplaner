document.addEventListener('DOMContentLoaded', () => {
    const statusEl = document.getElementById('status');
    const urlEl = document.getElementById('url');
    const clientsEl = document.getElementById('clients');

    window.electronAPI.getServerUrl().then(url => {
        urlEl.textContent = url;
    });

    window.electronAPI.onClientCountUpdate((count) => {
        clientsEl.textContent = count;
    });
});
