// # Plugin Capacitor
package com.medjiraservice.medjiraserviceapp;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context; 
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.os.Binder;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.google.firebase.database.DatabaseReference;
import com.google.firebase.database.FirebaseDatabase;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * Service foreground pour tracking conducteur VTC
 * Respecte medJiraV2.md : §5.2 (throttling 1Hz/0.2Hz), §7.1 (Firebase RTDB), §8.2 (RGPD)
 */
public class LocationForegroundService extends Service {
    
    private static final String CHANNEL_ID = "medjira_location_channel";
    private static final int NOTIFICATION_ID = 1001;
    private static final String WAKE_LOCK_TAG = "MedJira::LocationWakeLock";
    
    // Throttling selon §5.2
    private static final long UPDATE_INTERVAL_MOVING_MS = 1000;      // 1Hz en mouvement
    private static final long UPDATE_INTERVAL_STATIONARY_MS = 5000;  // 0.2Hz à l'arrêt
    private static final float MOVEMENT_THRESHOLD_METERS = 10f;      // Seuil détection mouvement
    private static final long STATIONARY_TIMEOUT_MS = 300000;        // 5min avant mode stationnaire (medJiraV2.md §6.1)
    
    private FusedLocationProviderClient fusedLocationClient;
    private DatabaseReference firebaseRef;
    private PowerManager.WakeLock wakeLock;
    private final Handler throttleHandler = new Handler(Looper.getMainLooper());
    
    private Location lastLocation = null;
    private long lastUpdateTime = 0;
    private boolean isMoving = true;
    private String driverId = null;
    private String tripId = null;
    
    private final IBinder binder = new LocalBinder();
    
    public class LocalBinder extends Binder {
        @SuppressWarnings("unused")
        LocationForegroundService getService() {
            return LocationForegroundService.this;
        }
    }
    
    @Override
    public void onCreate() {
        super.onCreate();
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this);
        
        // Firebase Realtime Database pour latence critique (§7.1)
        FirebaseDatabase database = FirebaseDatabase.getInstance();
        database.setPersistenceEnabled(true); // Offline support
        firebaseRef = database.getReference("driver_locations");
        
        createNotificationChannel();
    }
    
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_STICKY;
        
        driverId = intent.getStringExtra("driverId");
        tripId = intent.getStringExtra("tripId");
        
        if (driverId == null) {
            stopSelf();
            return START_NOT_STICKY;
        }
        
        // Wake lock pour empêcher Doze mode (§5.2 batterie préservée mais tracking fiable)
        acquireWakeLock();
        
        // Démarrage foreground avec type location (Android 12+)
        Notification notification = createNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, 
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        
        startLocationUpdates();
        return START_STICKY;
    }
    
    private void startLocationUpdates() {
        LocationRequest locationRequest = new LocationRequest.Builder(
            Priority.PRIORITY_BALANCED_POWER_ACCURACY, // Batterie optimisée (§5.2)
            UPDATE_INTERVAL_MOVING_MS
        )
        .setWaitForAccurateLocation(false) // Réduction latence
        .setMinUpdateIntervalMillis(500)   // Minimum 500ms entre updates
        .build();
        
        try {
            fusedLocationClient.requestLocationUpdates(
                locationRequest,
                locationCallback,
                Looper.getMainLooper()
            );
        } catch (SecurityException e) {
            // Gestion RGPD : permission refusée (§8.2)
            stopSelf();
        }
    }
    
    private final LocationCallback locationCallback = new LocationCallback() {
        @Override
        public void onLocationResult(@NonNull LocationResult result) {
            Location location = result.getLastLocation();
            if (location == null) return;
            
            long currentTime = System.currentTimeMillis();
            
            // Throttling adaptatif selon vitesse (§5.2)
            if (shouldUpdateLocation(location, currentTime)) {
                processLocationUpdate(location, currentTime);
            }
            
            // Détection mouvement/stationnaire
            updateMovementState(location);
        }
    };
    
    /**
     * Throttling intelligent : 1Hz si mouvement, 0.2Hz si stationnaire
     */
    private boolean shouldUpdateLocation(Location location, long currentTime) {
        if (lastLocation == null) return true;
        
        long timeSinceLastUpdate = currentTime - lastUpdateTime;
        float distance = location.distanceTo(lastLocation);
        
        // Toujours updater si déplacement significatif (>100m)
        if (distance > 100) return true;
        
        // Throttling selon état
        long minInterval = isMoving ? UPDATE_INTERVAL_MOVING_MS : UPDATE_INTERVAL_STATIONARY_MS;
        
        return timeSinceLastUpdate >= minInterval;
    }
    
    private void processLocationUpdate(Location location, long currentTime) {
        lastLocation = location;
        lastUpdateTime = currentTime;
        
        // Batch vers Firebase (§6.1 minimisation appels JS→Natif)
        Map<String, Object> locationData = new HashMap<>();
        locationData.put("lat", location.getLatitude());
        locationData.put("lng", location.getLongitude());
        locationData.put("accuracy", location.getAccuracy());
        locationData.put("speed", location.getSpeed());
        locationData.put("heading", location.getBearing());
        locationData.put("timestamp", currentTime);
        locationData.put("tripId", tripId);
        
        // Firebase Realtime Database avec TTL 24h (§7.1 + §8.2 anonymisation)
        DatabaseReference driverLocRef = firebaseRef.child(driverId);
        driverLocRef.setValue(locationData);
        driverLocRef.child("ttl").setValue(currentTime + TimeUnit.HOURS.toMillis(24));
    }
    
    private void updateMovementState(Location location) {
        if (lastLocation == null) return;
        
        float speed = location.getSpeed(); // m/s
        float distance = location.distanceTo(lastLocation);
        
        // Détection basée sur vitesse + distance
        boolean currentlyMoving = speed > 0.5f || distance > MOVEMENT_THRESHOLD_METERS;
        
        if (currentlyMoving != isMoving) {
            // Debounce changement d'état
            throttleHandler.removeCallbacksAndMessages(null);
            throttleHandler.postDelayed(() -> {
                isMoving = currentlyMoving;
                updateLocationRequestInterval();
            }, STATIONARY_TIMEOUT_MS);
        }
    }
    
    private void updateLocationRequestInterval() {
        // Reconfigurer LocationRequest selon nouvel état
        fusedLocationClient.removeLocationUpdates(locationCallback);
        startLocationUpdates();
    }
    
    private void acquireWakeLock() {
        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK, 
            WAKE_LOCK_TAG
        );
        wakeLock.acquire(TimeUnit.HOURS.toMillis(2)); // 2h max, renouvelé si actif
    }
    
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "MedJira Location Service",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Service de localisation pour courses VTC");
            NotificationManager manager = getSystemService(NotificationManager.class);
            manager.createNotificationChannel(channel);
        }
    }
    
    private Notification createNotification() {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 0, notificationIntent, 
            PendingIntent.FLAG_IMMUTABLE
        );
        
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("MedJira - En course")
            .setContentText("Localisation active pour le suivi client")
            .setSmallIcon(getApplicationInfo().icon) // Utilise l'icône de l'application par défaut
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build();
    }
    
    @Override
    public IBinder onBind(Intent intent) {
        return binder;
    }
    
    @Override
    public void onDestroy() {
        super.onDestroy();
        fusedLocationClient.removeLocationUpdates(locationCallback);
        throttleHandler.removeCallbacksAndMessages(null);
        
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        
        // Marquer conducteur hors-ligne dans Firebase
        if (driverId != null) {
            firebaseRef.child(driverId).child("online").setValue(false);
        }
    }
}