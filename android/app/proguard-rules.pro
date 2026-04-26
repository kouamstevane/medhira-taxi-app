# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# ── Capacitor ──────────────────────────────────────────────────────
-keep class com.getcapacitor.** { *; }

# ── Agora Voice SDK ────────────────────────────────────────────────
-keep class io.agora.** { *; }

# ── Firebase ───────────────────────────────────────────────────────
-keep class com.google.firebase.** { *; }

# ── WebView / JS bridge ───────────────────────────────────────────
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class * extends android.webkit.WebViewClient { *; }

# ── JNI / native methods ──────────────────────────────────────────
-keepclasseswithmembernames class * {
    native <methods>;
}

# ── Serializable ───────────────────────────────────────────────────
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    !static !transient <fields>;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# ── Parcelable ─────────────────────────────────────────────────────
-keepclassmembers class * implements android.os.Parcelable {
    public static final ** CREATOR;
}

# ── Suppress warnings ─────────────────────────────────────────────
-dontwarn javax.annotation.**
-dontwarn kotlin.Unit
-dontwarn retrofit2.**
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn com.google.devtools.build.android.desugar.runtime.**

-keep class com.google.devtools.build.android.desugar.runtime.ThrowableExtension { *; }
-dontwarn com.google.firebase.ktx.Firebase

# ── Stripe ──────────────────────────────────────────────────────────
-keep class com.stripe.** { *; }

# ── Google Maps ─────────────────────────────────────────────────────
-keep class com.google.android.gms.maps.** { *; }

# ── Capacitor Social Login ─────────────────────────────────────────
-keep class ee.forgr.** { *; }

# ── AndroidX Browser (OAuth / Chrome Custom Tabs) ──────────────────
-keep class androidx.browser.** { *; }

# ── Serialization models ───────────────────────────────────────────
-keepclassmembers,allowobfuscation class * {
    <fields>;
}
