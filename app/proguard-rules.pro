# Reglas de ProGuard para ActivePause
-keepattributes JavascriptInterface
-keepclassmembers class com.activepause.timer.MainActivity$AndroidBridge {
    <methods>;
}
