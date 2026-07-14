# WebView JavaScript interface methods must remain visible.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
