/**
 * NavRaksha - Digital Safety Companion
 * Complete safety tracking and emergency response system
 */

class NavRaksha {
    constructor() {
        this.currentPosition = null;
        this.watchId = null;
        this.map = null;
        this.userMarker = null;
        this.safeZoneCircle = null;
        this.safeZoneCenter = null;
        this.safeZoneRadius = 200;
        this.isListening = false;
        this.recognition = null;
        this.lastMotionTime = Date.now();
        this.motionThreshold = 15;
        this.inactivityTimeout = null;
        this.queuedEvents = [];
        this.userId = null;
        this.userData = null;
        
        this.init();
    }

    /**
     * Initialize the application
     */
    async init() {
        console.log('🛡️ NavRaksha initializing...');
        
        // Initialize components
        this.initializeEventListeners();
        this.initializeGeolocation();
        this.initializeMap();
        this.initializeSpeechRecognition();
        this.initializeMotionDetection();
        this.initializeNetworkStatus();
        this.initializeChart();
        this.loadStoredData();
        
        // Register service worker for PWA
        if ('serviceWorker' in navigator) {
            try {
                await navigator.serviceWorker.register('./service-worker.js');
                console.log('✅ Service Worker registered');
            } catch (error) {
                console.error('❌ Service Worker registration failed:', error);
            }
        }
        
        console.log('✅ NavRaksha initialized successfully');
    }

    /**
     * Initialize event listeners for UI interactions
     */
    initializeEventListeners() {
        // Registration form
        const registrationForm = document.getElementById('registration-form');
        registrationForm.addEventListener('submit', (e) => this.handleRegistration(e));

        // SOS button
        const sosButton = document.getElementById('sos-button');
        sosButton.addEventListener('click', () => this.triggerSOS());

        // Voice button
        const voiceButton = document.getElementById('voice-button');
        voiceButton.addEventListener('click', () => this.toggleVoiceRecognition());

        // Map controls
        document.getElementById('set-safe-zone').addEventListener('click', () => this.setSafeZone());
        document.getElementById('clear-safe-zone').addEventListener('click', () => this.clearSafeZone());
        
        const radiusSlider = document.getElementById('radius-slider');
        radiusSlider.addEventListener('input', (e) => {
            this.safeZoneRadius = parseInt(e.target.value);
            document.getElementById('radius-value').textContent = `${this.safeZoneRadius}m`;
            if (this.safeZoneCircle) {
                this.safeZoneCircle.setRadius(this.safeZoneRadius);
            }
        });

        // Modal controls
        document.getElementById('safe-yes').addEventListener('click', () => this.dismissSafetyCheck());
        document.getElementById('safe-no').addEventListener('click', () => this.triggerSOS());
        document.getElementById('sos-ok').addEventListener('click', () => this.closeSosModal());
        document.getElementById('alert-close').addEventListener('click', () => this.closeGeofenceAlert());

        // Accessibility toggle
        document.getElementById('contrast-toggle').addEventListener('click', () => this.toggleHighContrast());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.triggerSOS();
            }
            if (e.ctrlKey && e.key === 'v') {
                e.preventDefault();
                this.toggleVoiceRecognition();
            }
        });
    }

    /**
     * Handle user registration and generate digital ID
     */
    async handleRegistration(event) {
        event.preventDefault();
        
        const formData = new FormData(event.target);
        this.userData = {
            name: formData.get('name'),
            email: formData.get('email'),
            phone: formData.get('phone'),
            emergencyContact: formData.get('emergencyContact'),
            bloodGroup: formData.get('bloodGroup'),
            allergies: formData.get('allergies'),
            registrationTime: new Date().toISOString()
        };

        // Generate blockchain-style ID (UUID + hash)
        this.userId = this.generateBlockchainId(this.userData);
        
        // Store data locally
        localStorage.setItem('navraksha_user_data', JSON.stringify(this.userData));
        localStorage.setItem('navraksha_user_id', this.userId);

        // Generate and display QR code
        await this.displayDigitalId();
        
        console.log('✅ User registered with ID:', this.userId);
    }

    /**
     * Generate a blockchain-style unique ID
     */
    generateBlockchainId(userData) {
        const timestamp = Date.now();
        const randomBytes = new Uint8Array(16);
        crypto.getRandomValues(randomBytes);
        
        const dataString = JSON.stringify(userData) + timestamp;
        const hash = this.simpleHash(dataString);
        
        return `NR-${hash.substring(0, 8)}-${timestamp.toString(36).toUpperCase()}`;
    }

    /**
     * Simple hash function for ID generation
     */
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(16);
    }

    /**
     * Display digital ID with QR code
     */
    async displayDigitalId() {
        const digitalIdSection = document.getElementById('digital-id');
        const qrCodeContainer = document.getElementById('qr-code');
        
        // Generate QR code
        const qrData = JSON.stringify({
            id: this.userId,
            name: this.userData.name,
            emergency: this.userData.emergencyContact,
            blood: this.userData.bloodGroup,
            allergies: this.userData.allergies
        });
        
        try {
            await QRCode.toCanvas(qrCodeContainer, qrData, {
                width: 150,
                margin: 2,
                color: {
                    dark: '#dc2626',
                    light: '#ffffff'
                }
            });
        } catch (error) {
            console.error('QR Code generation failed:', error);
            qrCodeContainer.innerHTML = '<div style="width:150px;height:150px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;border-radius:8px;">QR Code</div>';
        }

        // Update ID details
        document.getElementById('user-id').textContent = this.userId;
        document.getElementById('user-name').textContent = this.userData.name;
        document.getElementById('generation-time').textContent = new Date().toLocaleString();
        
        digitalIdSection.style.display = 'block';
    }

    /**
     * Initialize geolocation tracking
     */
    initializeGeolocation() {
        if (!navigator.geolocation) {
            console.error('❌ Geolocation not supported');
            return;
        }

        const options = {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000
        };

        // Get initial position
        navigator.geolocation.getCurrentPosition(
            (position) => this.handleLocationUpdate(position),
            (error) => this.handleLocationError(error),
            options
        );

        // Start watching position
        this.watchId = navigator.geolocation.watchPosition(
            (position) => this.handleLocationUpdate(position),
            (error) => this.handleLocationError(error),
            options
        );

        console.log('📍 Geolocation tracking started');
    }

    /**
     * Handle location updates
     */
    handleLocationUpdate(position) {
        this.currentPosition = position;
        
        // Update GPS status
        const gpsStatus = document.getElementById('gps-status').querySelector('.status-dot');
        gpsStatus.classList.remove('offline');
        gpsStatus.classList.add('online');

        // Update location info
        const locationInfo = document.getElementById('location-info');
        locationInfo.textContent = `Lat: ${position.coords.latitude.toFixed(6)}, Lng: ${position.coords.longitude.toFixed(6)}`;

        // Update map
        if (this.map) {
            this.updateMapPosition(position);
        }

        // Check geofence
        this.checkGeofence(position);

        // Queue location update if offline
        if (!navigator.onLine) {
            this.queueEvent('location_update', {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                timestamp: Date.now()
            });
        }

        console.log('📍 Location updated:', position.coords.latitude, position.coords.longitude);
    }

    /**
     * Handle location errors
     */
    handleLocationError(error) {
        console.error('❌ Location error:', error.message);
        
        const gpsStatus = document.getElementById('gps-status').querySelector('.status-dot');
        gpsStatus.classList.remove('online');
        gpsStatus.classList.add('offline');

        const locationInfo = document.getElementById('location-info');
        locationInfo.textContent = `Error: ${error.message}`;
    }

    /**
     * Initialize the map
     */
    initializeMap() {
        // Initialize Leaflet map
        this.map = L.map('map').setView([28.6139, 77.2090], 13); // Default to Delhi

        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.map);

        console.log('🗺️ Map initialized');
    }

    /**
     * Update map position with user location
     */
    updateMapPosition(position) {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        // Update or create user marker
        if (this.userMarker) {
            this.userMarker.setLatLng([lat, lng]);
        } else {
            this.userMarker = L.marker([lat, lng], {
                icon: L.divIcon({
                    className: 'user-marker',
                    html: '📍',
                    iconSize: [30, 30],
                    iconAnchor: [15, 15]
                })
            }).addTo(this.map);
        }

        // Center map on user location
        this.map.setView([lat, lng], this.map.getZoom());
    }

    /**
     * Set safe zone around current location
     */
    setSafeZone() {
        if (!this.currentPosition) {
            alert('Location not available. Please wait for GPS to acquire your position.');
            return;
        }

        const lat = this.currentPosition.coords.latitude;
        const lng = this.currentPosition.coords.longitude;

        this.safeZoneCenter = [lat, lng];

        // Remove existing safe zone
        if (this.safeZoneCircle) {
            this.map.removeLayer(this.safeZoneCircle);
        }

        // Create new safe zone circle
        this.safeZoneCircle = L.circle([lat, lng], {
            color: '#059669',
            fillColor: '#059669',
            fillOpacity: 0.2,
            radius: this.safeZoneRadius
        }).addTo(this.map);

        // Update status
        document.getElementById('safe-zone-status').textContent = `Active (${this.safeZoneRadius}m)`;
        
        console.log('✅ Safe zone set:', lat, lng, this.safeZoneRadius);
    }

    /**
     * Clear safe zone
     */
    clearSafeZone() {
        if (this.safeZoneCircle) {
            this.map.removeLayer(this.safeZoneCircle);
            this.safeZoneCircle = null;
            this.safeZoneCenter = null;
        }

        document.getElementById('safe-zone-status').textContent = 'Not set';
        console.log('🗑️ Safe zone cleared');
    }

    /**
     * Check if user is within safe zone
     */
    checkGeofence(position) {
        if (!this.safeZoneCenter) return;

        const distance = this.calculateDistance(
            position.coords.latitude,
            position.coords.longitude,
            this.safeZoneCenter[0],
            this.safeZoneCenter[1]
        );

        if (distance > this.safeZoneRadius) {
            this.triggerGeofenceAlert();
        }
    }

    /**
     * Calculate distance between two points in meters
     */
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371e3; // Earth's radius in meters
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lng2 - lng1) * Math.PI / 180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return R * c;
    }

    /**
     * Trigger geofence alert
     */
    triggerGeofenceAlert() {
        const alert = document.getElementById('geofence-alert');
        alert.classList.add('show');

        // Play alert sound
        this.playAlertSound();

        // Auto-hide after 10 seconds
        setTimeout(() => {
            alert.classList.remove('show');
        }, 10000);

        console.log('⚠️ Geofence alert triggered');
    }

    /**
     * Close geofence alert
     */
    closeGeofenceAlert() {
        document.getElementById('geofence-alert').classList.remove('show');
    }

    /**
     * Initialize speech recognition for voice SOS
     */
    initializeSpeechRecognition() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            console.warn('⚠️ Speech recognition not supported');
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.recognition.onresult = (event) => {
            const transcript = Array.from(event.results)
                .map(result => result[0])
                .map(result => result.transcript)
                .join('');

            console.log('🎤 Speech detected:', transcript);

            // Check for emergency keywords
            if (transcript.toLowerCase().includes('help') || 
                transcript.toLowerCase().includes('sos') ||
                transcript.toLowerCase().includes('emergency')) {
                this.triggerSOS();
                this.stopVoiceRecognition();
            }
        };

        this.recognition.onerror = (event) => {
            console.error('❌ Speech recognition error:', event.error);
        };

        console.log('🎤 Speech recognition initialized');
    }

    /**
     * Toggle voice recognition
     */
    toggleVoiceRecognition() {
        if (!this.recognition) {
            alert('Voice recognition not supported in this browser');
            return;
        }

        if (this.isListening) {
            this.stopVoiceRecognition();
        } else {
            this.startVoiceRecognition();
        }
    }

    /**
     * Start voice recognition
     */
    startVoiceRecognition() {
        try {
            this.recognition.start();
            this.isListening = true;
            
            const voiceButton = document.getElementById('voice-button');
            const voiceIcon = document.getElementById('voice-icon');
            
            voiceButton.classList.add('listening');
            voiceIcon.textContent = '🔴';
            
            console.log('🎤 Voice recognition started');
        } catch (error) {
            console.error('❌ Failed to start voice recognition:', error);
        }
    }

    /**
     * Stop voice recognition
     */
    stopVoiceRecognition() {
        if (this.recognition && this.isListening) {
            this.recognition.stop();
            this.isListening = false;
            
            const voiceButton = document.getElementById('voice-button');
            const voiceIcon = document.getElementById('voice-icon');
            
            voiceButton.classList.remove('listening');
            voiceIcon.textContent = '🎤';
            
            console.log('🎤 Voice recognition stopped');
        }
    }

    /**
     * Initialize motion detection for fall detection
     */
    initializeMotionDetection() {
        if (!window.DeviceMotionEvent) {
            console.warn('⚠️ Device motion not supported');
            return;
        }

        window.addEventListener('devicemotion', (event) => {
            const acceleration = event.accelerationIncludingGravity;
            if (!acceleration) return;

            // Calculate total acceleration
            const totalAcceleration = Math.sqrt(
                Math.pow(acceleration.x || 0, 2) +
                Math.pow(acceleration.y || 0, 2) +
                Math.pow(acceleration.z || 0, 2)
            );

            // Detect sudden acceleration (possible fall)
            if (totalAcceleration > this.motionThreshold) {
                this.handleSuddenMotion();
            }

            this.lastMotionTime = Date.now();
        });

        // Check for inactivity
        setInterval(() => {
            const timeSinceLastMotion = Date.now() - this.lastMotionTime;
            if (timeSinceLastMotion > 30000) { // 30 seconds of inactivity
                // Could trigger safety check here
                console.log('⚠️ Extended inactivity detected');
            }
        }, 10000);

        console.log('📱 Motion detection initialized');
    }

    /**
     * Handle sudden motion detection
     */
    handleSuddenMotion() {
        console.log('⚠️ Sudden motion detected');
        
        // Clear any existing timeout
        if (this.inactivityTimeout) {
            clearTimeout(this.inactivityTimeout);
        }

        // Wait for inactivity after sudden motion
        this.inactivityTimeout = setTimeout(() => {
            this.showSafetyCheck();
        }, 5000); // 5 seconds of inactivity after sudden motion
    }

    /**
     * Show safety check modal
     */
    showSafetyCheck() {
        const modal = document.getElementById('safety-modal');
        modal.classList.add('show');

        let countdown = 10;
        const countdownElement = document.getElementById('countdown');
        
        const countdownInterval = setInterval(() => {
            countdown--;
            countdownElement.textContent = countdown;
            
            if (countdown <= 0) {
                clearInterval(countdownInterval);
                this.triggerSOS();
                this.dismissSafetyCheck();
            }
        }, 1000);

        // Store interval for cleanup
        this.safetyCheckInterval = countdownInterval;

        console.log('🚨 Safety check initiated');
    }

    /**
     * Dismiss safety check
     */
    dismissSafetyCheck() {
        const modal = document.getElementById('safety-modal');
        modal.classList.remove('show');
        
        if (this.safetyCheckInterval) {
            clearInterval(this.safetyCheckInterval);
        }
        
        console.log('✅ Safety check dismissed');
    }

    /**
     * Trigger SOS emergency alert
     */
    async triggerSOS() {
        console.log('🆘 SOS triggered');
        
        const sosData = {
            userId: this.userId,
            timestamp: new Date().toISOString(),
            location: this.currentPosition ? {
                latitude: this.currentPosition.coords.latitude,
                longitude: this.currentPosition.coords.longitude,
                accuracy: this.currentPosition.coords.accuracy
            } : null,
            userData: this.userData
        };

        // Update last alert time
        document.getElementById('last-alert').textContent = new Date().toLocaleString();

        // Send SOS (mock endpoint)
        try {
            if (navigator.onLine) {
                await this.sendSOSRequest(sosData);
            } else {
                this.queueEvent('sos', sosData);
            }
        } catch (error) {
            console.error('❌ SOS send failed:', error);
            this.queueEvent('sos', sosData);
        }

        // Show confirmation modal
        this.showSOSConfirmation(sosData);
        
        // Play alert sound
        this.playAlertSound();
    }

    /**
     * Send SOS request to mock endpoint
     */
    async sendSOSRequest(sosData) {
        // Mock API call - in real implementation, this would be your emergency endpoint
        const response = await fetch('/api/emergency/sos', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(sosData)
        });

        if (!response.ok) {
            throw new Error('SOS request failed');
        }

        console.log('✅ SOS sent successfully');
        return response.json();
    }

    /**
     * Show SOS confirmation modal
     */
    showSOSConfirmation(sosData) {
        const modal = document.getElementById('sos-modal');
        const locationElement = document.getElementById('sos-location');
        const timeElement = document.getElementById('sos-time');

        if (sosData.location) {
            locationElement.textContent = `${sosData.location.latitude.toFixed(6)}, ${sosData.location.longitude.toFixed(6)}`;
        } else {
            locationElement.textContent = 'Location unavailable';
        }

        timeElement.textContent = new Date(sosData.timestamp).toLocaleString();
        modal.classList.add('show');
    }

    /**
     * Close SOS modal
     */
    closeSosModal() {
        document.getElementById('sos-modal').classList.remove('show');
    }

    /**
     * Play alert sound
     */
    playAlertSound() {
        const audio = document.getElementById('alert-sound');
        audio.play().catch(error => {
            console.warn('⚠️ Could not play alert sound:', error);
        });
    }

    /**
     * Queue events for offline sync
     */
    queueEvent(type, data) {
        const event = {
            id: Date.now() + Math.random(),
            type,
            data,
            timestamp: Date.now()
        };

        this.queuedEvents.push(event);
        localStorage.setItem('navraksha_queued_events', JSON.stringify(this.queuedEvents));
        
        // Update UI
        document.getElementById('queued-events').textContent = this.queuedEvents.length;
        
        console.log('📦 Event queued:', type);
    }

    /**
     * Initialize network status monitoring
     */
    initializeNetworkStatus() {
        const updateNetworkStatus = () => {
            const networkStatus = document.getElementById('network-status').querySelector('.status-dot');
            
            if (navigator.onLine) {
                networkStatus.classList.remove('offline');
                networkStatus.classList.add('online');
                this.syncQueuedEvents();
            } else {
                networkStatus.classList.remove('online');
                networkStatus.classList.add('offline');
            }
        };

        window.addEventListener('online', updateNetworkStatus);
        window.addEventListener('offline', updateNetworkStatus);
        
        // Initial check
        updateNetworkStatus();
        
        console.log('🌐 Network status monitoring initialized');
    }

    /**
     * Sync queued events when back online
     */
    async syncQueuedEvents() {
        if (this.queuedEvents.length === 0) return;

        console.log('🔄 Syncing queued events...');

        const eventsToSync = [...this.queuedEvents];
        
        for (const event of eventsToSync) {
            try {
                if (event.type === 'sos') {
                    await this.sendSOSRequest(event.data);
                } else if (event.type === 'location_update') {
                    // Mock location sync
                    console.log('📍 Syncing location update:', event.data);
                }
                
                // Remove synced event
                this.queuedEvents = this.queuedEvents.filter(e => e.id !== event.id);
            } catch (error) {
                console.error('❌ Failed to sync event:', error);
                break; // Stop syncing on error
            }
        }

        // Update storage and UI
        localStorage.setItem('navraksha_queued_events', JSON.stringify(this.queuedEvents));
        document.getElementById('queued-events').textContent = this.queuedEvents.length;
        
        console.log('✅ Event sync completed');
    }

    /**
     * Initialize dashboard chart
     */
    initializeChart() {
        const ctx = document.getElementById('incidents-chart').getContext('2d');
        
        // Sample data for demonstration
        const sampleData = {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            datasets: [{
                label: 'Safety Incidents',
                data: [2, 1, 3, 0, 1, 2, 0],
                backgroundColor: 'rgba(220, 38, 38, 0.2)',
                borderColor: 'rgba(220, 38, 38, 1)',
                borderWidth: 2,
                fill: true
            }]
        };

        new Chart(ctx, {
            type: 'line',
            data: sampleData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 5
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });

        console.log('📊 Chart initialized');
    }

    /**
     * Toggle high contrast mode
     */
    toggleHighContrast() {
        document.body.classList.toggle('high-contrast');
        const isHighContrast = document.body.classList.contains('high-contrast');
        localStorage.setItem('navraksha_high_contrast', isHighContrast);
        
        console.log('🎨 High contrast mode:', isHighContrast ? 'enabled' : 'disabled');
    }

    /**
     * Load stored data on app start
     */
    loadStoredData() {
        // Load user data
        const storedUserData = localStorage.getItem('navraksha_user_data');
        const storedUserId = localStorage.getItem('navraksha_user_id');
        
        if (storedUserData && storedUserId) {
            this.userData = JSON.parse(storedUserData);
            this.userId = storedUserId;
            this.displayDigitalId();
        }

        // Load queued events
        const storedEvents = localStorage.getItem('navraksha_queued_events');
        if (storedEvents) {
            this.queuedEvents = JSON.parse(storedEvents);
            document.getElementById('queued-events').textContent = this.queuedEvents.length;
        }

        // Load high contrast preference
        const highContrast = localStorage.getItem('navraksha_high_contrast');
        if (highContrast === 'true') {
            document.body.classList.add('high-contrast');
        }

        console.log('💾 Stored data loaded');
    }
}

// Initialize NavRaksha when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.navraksha = new NavRaksha();
});

// Handle app installation prompt
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    
    // Show install button or notification
    console.log('📱 App can be installed');
});

// Handle successful installation
window.addEventListener('appinstalled', () => {
    console.log('✅ NavRaksha installed successfully');
    deferredPrompt = null;
});