package com.medjiraservice.medjiraserviceapp;

import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import androidx.core.content.ContextCompat;
import android.content.pm.PackageManager;
import android.Manifest;

/**
 * Plugin Capacitor pour background geolocation
 * Bridge minimal JS→Natif selon §6.1 (minimisation appels bridge)
 */
@CapacitorPlugin(
    name = "BackgroundGeolocation",
    permissions = {
        @Permission(strings = {Manifest.permission.ACCESS_FINE_LOCATION}, alias = "location"),
        @Permission(strings = {Manifest.permission.ACCESS_BACKGROUND_LOCATION}, alias = "backgroundLocation"),
        @Permission(strings = {Manifest.permission.FOREGROUND_SERVICE}, alias = "foregroundService")
    }
)
public class BackgroundGeolocationPlugin extends Plugin {
    
    @PluginMethod
    public void startTracking(PluginCall call) {
        String driverId = call.getString("driverId");
        String tripId = call.getString("tripId");

        if (driverId == null) {
            call.reject("DRIVER_ID_REQUIRED", "L'identifiant conducteur est requis (RGPD §8.2)");
            return;
        }

        if (!checkLocationPermissions()) {
            requestAllPermissions(call, "permissionsCallback");
            return;
        }

        startService(driverId, tripId);
        call.resolve();
    }
    
    @PluginMethod
    public void stopTracking(PluginCall call) {
        Intent intent = new Intent(getContext(), LocationForegroundService.class);
        getContext().stopService(intent);
        
        JSObject ret = new JSObject();
        ret.put("stopped", true);
        call.resolve(ret);
    }
    
    @PluginMethod
    public void getCurrentStatus(PluginCall call) {
        // Retourne état sans appel natif (cache local)
        JSObject ret = new JSObject();
        ret.put("isTracking", isServiceRunning());
        ret.put("hasPermissions", hasRequiredPermissions());
        call.resolve(ret);
    }
    
    private void startService(String driverId, String tripId) {
        Intent intent = new Intent(getContext(), LocationForegroundService.class);
        intent.putExtra("driverId", driverId);
        intent.putExtra("tripId", tripId);

        ContextCompat.startForegroundService(getContext(), intent);
    }

    private boolean checkLocationPermissions() {
        return getContext().checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
    }

    @PermissionCallback
    private void permissionsCallback(PluginCall call) {
        if (checkLocationPermissions()) {
            String driverId = call.getString("driverId");
            String tripId = call.getString("tripId");
            startService(driverId, tripId);
            call.resolve();
        } else {
            call.reject("PERMISSION_DENIED", "Permissions localisation requises pour le service VTC");
        }
    }
    
    private boolean isServiceRunning() {
        // Vérification via ActivityManager (simplifié)
        // En production : vérifier via bound service ou shared preference
        return false;
    }
}