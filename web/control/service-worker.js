/**
 * Service Worker for House Points Control PWA
 * Enhanced offline support with action queuing and auto-sync
 */

const CACHE_VERSION = 'v1.1';
const CACHE_NAME = `house-points-${CACHE_VERSION}`;
const OFFLINE_DATA_STORE = 'offline-pending-actions';

// Assets to cache on install
const ASSETS_TO_CACHE = [
  '/web/control/',
  '/web/control/index.html',
  '/web/control/control.css',
  '/web/control/control.js',
  '/web/control/tag-utils.js',
  '/web/control/manifest.json'
];

// Track online status
let isOnline = navigator.onLine;
self.addEventListener('online', () => {
  isOnline = true;
  broadcastToClients({ type: 'OFFLINE_STATUS_CHANGED', isOnline: true });
});
self.addEventListener('offline', () => {
  isOnline = false;
  broadcastToClients({ type: 'OFFLINE_STATUS_CHANGED', isOnline: false });
});

// Broadcast message to all clients
function broadcastToClients(message) {
  self.clients.matchAll().then(clients => {
    clients.forEach(client => client.postMessage(message));
  });
}

// Install event - cache assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
        console.warn('Failed to cache some assets:', err);
        return Promise.resolve();
      });
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Network first strategy for API calls
  if (event.request.url.includes('firebaseapp.com') || event.request.url.includes('googleapis.com')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (!response || response.status !== 200) {
            return response;
          }
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache first strategy for static assets
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        return response;
      });
    })
  );
});

// Handle messages from clients
self.addEventListener('message', event => {
  if (!event.data) return;

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data.type === 'QUEUE_OFFLINE_ACTION') {
    // Queue an action for later sync
    queueOfflineAction(event.data.action);
    event.ports[0].postMessage({ queued: true });
  } else if (event.data.type === 'GET_PENDING_ACTIONS') {
    // Return list of pending actions
    getPendingActions().then(actions => {
      event.ports[0].postMessage({ actions });
    });
  } else if (event.data.type === 'CLEAR_PENDING_ACTIONS') {
    // Clear pending actions after successful sync
    clearPendingActions();
    broadcastToClients({ type: 'PENDING_ACTIONS_CLEARED' });
  }
});

// Queue offline action in IndexedDB or localStorage backup
function queueOfflineAction(action) {
  if (!self.indexedDB) {
    console.warn('IndexedDB not available, using localStorage');
    const pending = JSON.parse(localStorage.getItem(OFFLINE_DATA_STORE) || '[]');
    pending.push({
      id: `action_${Date.now()}_${Math.random()}`,
      timestamp: Date.now(),
      ...action
    });
    localStorage.setItem(OFFLINE_DATA_STORE, JSON.stringify(pending));
    return;
  }

  const request = indexedDB.open('HousePointsOffline', 1);
  request.onerror = () => console.error('IndexedDB open error');
  request.onsuccess = (event) => {
    const db = event.target.result;
    const transaction = db.transaction(['pendingActions'], 'readwrite');
    const store = transaction.objectStore('pendingActions');
    store.add({
      id: `action_${Date.now()}_${Math.random()}`,
      timestamp: Date.now(),
      ...action
    });
  };
}

// Get pending actions
function getPendingActions() {
  return new Promise((resolve) => {
    if (!self.indexedDB) {
      const pending = JSON.parse(localStorage.getItem(OFFLINE_DATA_STORE) || '[]');
      resolve(pending);
      return;
    }

    const request = indexedDB.open('HousePointsOffline', 1);
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(['pendingActions'], 'readonly');
      const store = transaction.objectStore('pendingActions');
      const getAllRequest = store.getAll();
      getAllRequest.onsuccess = () => resolve(getAllRequest.result || []);
    };
  });
}

// Clear pending actions
function clearPendingActions() {
  if (!self.indexedDB) {
    localStorage.removeItem(OFFLINE_DATA_STORE);
    return;
  }

  const request = indexedDB.open('HousePointsOffline', 1);
  request.onsuccess = (event) => {
    const db = event.target.result;
    const transaction = db.transaction(['pendingActions'], 'readwrite');
    const store = transaction.objectStore('pendingActions');
    store.clear();
  };
}
