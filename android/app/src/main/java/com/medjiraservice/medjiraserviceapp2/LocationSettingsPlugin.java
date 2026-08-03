package com.medjiraservice.medjiraserviceapp2;

import android.content.Intent;
import android.provider.Settings;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "LocationSettings")
public class LocationSettingsPlugin extends Plugin {
    @PluginMethod
    public void open(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("Impossible d'ouvrir les réglages de localisation.", error);
        }
    }
}
