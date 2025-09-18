/**
 * NavRaksha Service Worker
 * Handles offline functionality, caching, and background sync
 */

const CACHE_NAME = 'navraksha-v1.0.0';
const STATIC_CACHE = 'navraksha-static-v1.0.0';
const DYNAMIC_CACHE = 'navraksha-dynamic-v1.0.0';

// Files to cache for offline functionality
const STATIC_FILES = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/manifest.json',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js'
];

// Install event - cache static files
self.addEventListener('install', (event) => {
    console.log('🔧 Service Worker installing...');
    
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                console.log('📦 Caching static files...');
                return cache.addAll(STATIC_FILES);
            })
            .then(() => {
                console.log('✅ Static files cached successfully');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('❌ Failed to cache static files:', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('🚀 Service Worker activating...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
                            console.log('🗑️ Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('✅ Service Worker activated');
                return self.clients.claim();
            })
    );
});

// Fetch event - serve cached files when offline
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Handle API requests
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(handleApiRequest(request));
        return;
    }

    // Handle static file requests
    event.respondWith(
        caches.match(request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }

                // If not in cache, fetch from network
                return fetch(request)
                    .then((response) => {
                        // Don't cache non-successful responses
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }

                        // Clone the response
                        const responseToCache = response.clone();

                        // Add to dynamic cache
                        caches.open(DYNAMIC_CACHE)
                            .then((cache) => {
                                cache.put(request, responseToCache);
                            });

                        return response;
                    })
                    .catch(() => {
                        // Return offline page or default response
                        if (request.destination === 'document') {
                            return caches.match('/index.html');
                        }
                    });
            })
    );
});

// Handle API requests with offline queueing
async function handleApiRequest(request) {
    try {
        // Try to fetch from network first
        const response = await fetch(request);
        return response;
    } catch (error) {
        console.log('📡 API request failed, handling offline...');
        
        // Handle different API endpoints
        const url = new URL(request.url);
        
        if (url.pathname === '/api/emergency/sos') {
            return handleOfflineSOS(request);
        }
        
        // Return generic offline response
        return new Response(
            JSON.stringify({
                error: 'Offline',
                message: 'Request queued for when connection is restored',
                queued: true
            }),
            {
                status: 202,
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );
    }
}

// Handle offline SOS requests
async function handleOfflineSOS(request) {
    try {
        const sosData = await request.json();
        
        // Store SOS request for later sync
        const sosQueue = await getSOSQueue();
        sosQueue.push({
            id: Date.now(),
            data: sosData,
            timestamp: Date.now()
        });
        
        await setSOSQueue(sosQueue);
        
        // Show notification if possible
        if (self.registration.showNotification) {
            self.registration.showNotification('NavRaksha - SOS Queued', {
                body: 'Emergency alert queued. Will be sent when connection is restored.',
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                tag: 'sos-queued',
                requireInteraction: true,
                actions: [
                    {
                        action: 'view',
                        title: 'View Details'
                    }
                ]
            });
        }
        
        return new Response(
            JSON.stringify({
                success: true,
                message: 'SOS queued for transmission',
                queued: true,
                id: Date.now()
            }),
            {
                status: 202,
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );
    } catch (error) {
        console.error('❌ Failed to handle offline SOS:', error);
        
        return new Response(
            JSON.stringify({
                error: 'Failed to queue SOS',
                message: error.message
            }),
            {
                status: 500,
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );
    }
}

// Background sync for queued requests
self.addEventListener('sync', (event) => {
    console.log('🔄 Background sync triggered:', event.tag);
    
    if (event.tag === 'sos-sync') {
        event.waitUntil(syncSOSQueue());
    }
});

// Sync queued SOS requests
async function syncSOSQueue() {
    try {
        const sosQueue = await getSOSQueue();
        
        if (sosQueue.length === 0) {
            return;
        }
        
        console.log(`🔄 Syncing ${sosQueue.length} SOS requests...`);
        
        const syncedIds = [];
        
        for (const sosRequest of sosQueue) {
            try {
                const response = await fetch('/api/emergency/sos', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(sosRequest.data)
                });
                
                if (response.ok) {
                    syncedIds.push(sosRequest.id);
                    console.log('✅ SOS request synced:', sosRequest.id);
                    
                    // Show success notification
                    if (self.registration.showNotification) {
                        self.registration.showNotification('NavRaksha - SOS Sent', {
                            body: 'Emergency alert successfully transmitted to authorities.',
                            icon: '/icon-192.png',
                            tag: 'sos-sent'
                        });
                    }
                }
            } catch (error) {
                console.error('❌ Failed to sync SOS request:', error);
            }
        }
        
        // Remove synced requests from queue
        if (syncedIds.length > 0) {
            const remainingQueue = sosQueue.filter(req => !syncedIds.includes(req.id));
            await setSOSQueue(remainingQueue);
        }
        
    } catch (error) {
        console.error('❌ SOS sync failed:', error);
    }
}

// Utility functions for SOS queue management
async function getSOSQueue() {
    try {
        const cache = await caches.open(DYNAMIC_CACHE);
        const response = await cache.match('/sos-queue');
        
        if (response) {
            return await response.json();
        }
        
        return [];
    } catch (error) {
        console.error('❌ Failed to get SOS queue:', error);
        return [];
    }
}

async function setSOSQueue(queue) {
    try {
        const cache = await caches.open(DYNAMIC_CACHE);
        const response = new Response(JSON.stringify(queue), {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        await cache.put('/sos-queue', response);
    } catch (error) {
        console.error('❌ Failed to set SOS queue:', error);
    }
}

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    console.log('🔔 Notification clicked:', event.notification.tag);
    
    event.notification.close();
    
    // Handle different notification actions
    if (event.action === 'view' || event.notification.tag === 'sos-sent') {
        event.waitUntil(
            clients.openWindow('/')
        );
    }
});

// Handle push messages (for future implementation)
self.addEventListener('push', (event) => {
    console.log('📨 Push message received');
    
    if (event.data) {
        const data = event.data.json();
        
        event.waitUntil(
            self.registration.showNotification(data.title || 'NavRaksha', {
                body: data.body || 'New safety alert',
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                tag: data.tag || 'general',
                data: data.data || {}
            })
        );
    }
});

// Periodic background sync for location updates
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'location-sync') {
        event.waitUntil(syncLocationUpdates());
    }
});

// Sync location updates (placeholder for future implementation)
async function syncLocationUpdates() {
    console.log('📍 Syncing location updates...');
    // Implementation would sync queued location data
}

// Handle messages from main thread
self.addEventListener('message', (event) => {
    console.log('💬 Message received:', event.data);
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'QUEUE_SOS') {
        // Queue SOS for background sync
        self.registration.sync.register('sos-sync');
    }
});

console.log('🛡️ NavRaksha Service Worker loaded');