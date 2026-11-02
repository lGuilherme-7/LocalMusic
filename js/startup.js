const databaseName = 'local-music-library';
const storeName = 'tracks';
const screen = document.querySelector('.startup-screen');
const message = document.getElementById('startup-message');
const actions = document.getElementById('startup-actions');
const retry = document.getElementById('startup-retry');

function openLibraryDatabase() {
  if (!('indexedDB' in globalThis)) return Promise.reject(new Error('IndexedDB não está disponível.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Falha ao abrir a biblioteca.'));
    request.onblocked = () => reject(new Error('O armazenamento está sendo atualizado em outra janela.'));
  });
}

function countTracks(database) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).count();
    request.onsuccess = () => resolve(request.result || 0);
    request.onerror = () => reject(request.error || transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('A leitura da biblioteca foi interrompida.'));
  });
}

async function prepareStartup() {
  screen.classList.remove('is-error');
  actions.hidden = true;
  message.textContent = 'Preparando sua biblioteca';
  try {
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('./service-worker.js', { scope: './' }).catch(() => {});
    const database = await openLibraryDatabase();
    const trackCount = await countTracks(database);
    database.close();
    try {
      sessionStorage.setItem('lm_startup_summary', JSON.stringify({ trackCount, preparedAt: Date.now() }));
    } catch {
      // A inicialização não depende da disponibilidade do sessionStorage.
    }
    location.replace('./index.html?startup=1');
  } catch (error) {
    console.error('Local Music: preparação inicial interrompida.', error);
    screen.classList.add('is-error');
    message.textContent = 'Não foi possível preparar a biblioteca';
    actions.hidden = false;
  }
}

retry.addEventListener('click', prepareStartup);
void prepareStartup();
