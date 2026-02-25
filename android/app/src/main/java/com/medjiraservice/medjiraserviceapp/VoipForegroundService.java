package com.medjiraservice.medjiraserviceapp;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * Service foreground pour les appels VoIP
 * Maintient l'appel actif en arrière-plan et affiche une notification persistante
 */
public class VoipForegroundService extends Service {
    private static final String CHANNEL_ID = "voip_call_channel";
    private static final int NOTIFICATION_ID = 1001;
    private static final String ACTION_END_CALL = "com.medjiraservice.medjiraserviceapp.END_CALL";

    private String callerName = "";
    private String callId = "";

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            callerName = intent.getStringExtra("callerName");
            callId = intent.getStringExtra("callId");
        }

        // Créer la notification foreground
        Notification notification = createCallNotification();

        // Démarrer le service en mode foreground
        startForeground(NOTIFICATION_ID, notification);

        // Le service ne doit pas être redémarré s'il est tué par le système
        return START_NOT_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null; // Pas de binding nécessaire
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        // Nettoyer les ressources si nécessaire
        stopForeground(true);
    }

    /**
     * Crée le channel de notification (requis pour Android O+)
     */
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Appels VoIP",
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Notifications pour les appels vocaux en cours");
            channel.setSound(null, null); // Pas de son personnalisé (géré par l'UI)

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    /**
     * Crée la notification pour l'appel en cours
     */
    private Notification createCallNotification() {
        // Créer un intent pour retourner à l'application
        Intent notificationIntent = new Intent(this, MainActivity.class);
        notificationIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        notificationIntent.putExtra("callId", callId);

        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                0,
                notificationIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        // Créer un intent pour terminer l'appel
        Intent endCallIntent = new Intent(ACTION_END_CALL);
        endCallIntent.putExtra("callId", callId);

        PendingIntent endCallPendingIntent = PendingIntent.getBroadcast(
                this,
                0,
                endCallIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        // Construire la notification
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Appel en cours")
                .setContentText(callerName != null && !callerName.isEmpty() 
                        ? "Appel avec " + callerName 
                        : "Appel VoIP en cours")
                .setSmallIcon(R.drawable.ic_notification)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setOngoing(true) // Non swipable
                .setContentIntent(pendingIntent)
                .addAction(
                        R.drawable.ic_notification,
                        "Terminer",
                        endCallPendingIntent
                )
                .setShowWhen(true)
                .setUsesChronometer(true);

        return builder.build();
    }

    /**
     * Met à jour la notification avec un nouveau nom d'appelant
     */
    public void updateCallerName(String name) {
        this.callerName = name;
        NotificationManagerCompat.from(this).notify(NOTIFICATION_ID, createCallNotification());
    }

    /**
     * Met à jour la notification pour montrer que l'appel est terminé
     */
    public void updateCallEnded() {
        NotificationManagerCompat.from(this).cancel(NOTIFICATION_ID);
        stopForeground(true);
        stopSelf();
    }
}
