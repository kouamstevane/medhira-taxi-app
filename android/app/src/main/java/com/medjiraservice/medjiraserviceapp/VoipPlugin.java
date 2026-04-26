package com.medjiraservice.medjiraserviceapp;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "VoipForeground")
public class VoipPlugin extends Plugin {

    @PluginMethod
    public void startService(PluginCall call) {
        String callerName = call.getString("callerName", "Appelant inconnu");
        String callId = call.getString("callId", "");

        Intent intent = new Intent(getContext(), VoipForegroundService.class);
        intent.putExtra("callerName", callerName);
        intent.putExtra("callId", callId);

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void stopService(PluginCall call) {
        Intent intent = new Intent(getContext(), VoipForegroundService.class);
        getContext().stopService(intent);
        call.resolve();
    }
}
