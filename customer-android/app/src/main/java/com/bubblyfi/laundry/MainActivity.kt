package com.bubblyfi.laundry

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.speech.tts.TextToSpeech
import android.util.Log
import android.view.View
import android.webkit.ConsoleMessage
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.MimeTypeMap
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewAssetLoader
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

class MainActivity : ComponentActivity(), TextToSpeech.OnInitListener {
    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var assetLoader: WebViewAssetLoader
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingGeoOrigin: String? = null
    private var pendingGeoCallback: GeolocationPermissions.Callback? = null
    private var textToSpeech: TextToSpeech? = null
    private var ttsReady = false

    private val filePicker = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val callback = fileCallback ?: return@registerForActivityResult
        fileCallback = null
        if (result.resultCode != Activity.RESULT_OK) {
            callback.onReceiveValue(null)
            return@registerForActivityResult
        }
        val data = result.data
        val uris = mutableListOf<Uri>()
        data?.clipData?.let { clip ->
            for (i in 0 until clip.itemCount) uris.add(clip.getItemAt(i).uri)
        }
        data?.data?.let { if (!uris.contains(it)) uris.add(it) }
        callback.onReceiveValue(if (uris.isEmpty()) null else uris.toTypedArray())
    }

    private val locationPermission = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val granted = permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            permissions[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        pendingGeoCallback?.invoke(pendingGeoOrigin, granted, false)
        pendingGeoOrigin = null
        pendingGeoCallback = null
        if (!granted) {
            Toast.makeText(this, "Location was not shared. You can still enter the address manually.", Toast.LENGTH_LONG).show()
        }
    }

    private val notificationPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* no-op: JS reads current status lazily via getFcmToken() */ }

    private var pendingAuthCallbackUrl: String? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        webView = findViewById(R.id.webView)
        progressBar = findViewById(R.id.progressBar)
        window.statusBarColor = Color.rgb(7, 72, 87)
        window.navigationBarColor = Color.WHITE

        textToSpeech = TextToSpeech(this, this)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            allowFileAccess = false
            allowContentAccess = true
            setSupportMultipleWindows(false)
            javaScriptCanOpenWindowsAutomatically = false
            mediaPlaybackRequiresUserGesture = false
            setGeolocationEnabled(true)
            userAgentString = "$userAgentString BubblyfiAndroid/${BuildConfig.VERSION_NAME}"
        }
        webView.setBackgroundColor(Color.WHITE)
        webView.addJavascriptInterface(AndroidBridge(), "AndroidBridge")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                assetLoader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if (uri.host == WebViewAssetLoader.DEFAULT_DOMAIN) return false
                return openExternal(uri)
            }

            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                progressBar.visibility = View.GONE
                flushPendingAuthCallback()
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                progressBar.progress = newProgress
                progressBar.visibility = if (newProgress < 100) View.VISIBLE else View.GONE
            }

            override fun onConsoleMessage(consoleMessage: ConsoleMessage): Boolean {
                Log.d("BubblyfiWeb", "${consoleMessage.message()} @ ${consoleMessage.sourceId()}:${consoleMessage.lineNumber()}")
                return true
            }

            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = filePathCallback
                val accept = fileChooserParams?.acceptTypes
                    ?.firstOrNull { it.isNotBlank() }
                    ?.substringBefore(';')
                    ?: "image/*"
                val safeType = if (accept.startsWith("image/")) accept else "image/*"
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = safeType
                    putExtra(
                        Intent.EXTRA_ALLOW_MULTIPLE,
                        fileChooserParams?.mode == FileChooserParams.MODE_OPEN_MULTIPLE
                    )
                }
                return try {
                    filePicker.launch(intent)
                    true
                } catch (error: ActivityNotFoundException) {
                    fileCallback = null
                    Toast.makeText(this@MainActivity, "No photo picker is available on this device.", Toast.LENGTH_LONG).show()
                    false
                }
            }

            override fun onGeolocationPermissionsShowPrompt(
                origin: String?,
                callback: GeolocationPermissions.Callback?
            ) {
                if (origin == null || callback == null) return
                val fine = ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.ACCESS_FINE_LOCATION)
                val coarse = ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.ACCESS_COARSE_LOCATION)
                if (fine == PackageManager.PERMISSION_GRANTED || coarse == PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin, true, false)
                } else {
                    pendingGeoOrigin = origin
                    pendingGeoCallback = callback
                    locationPermission.launch(arrayOf(
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                    ))
                }
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })

        if (savedInstanceState == null) {
            webView.loadUrl("https://${WebViewAssetLoader.DEFAULT_DOMAIN}/assets/www/index.html")
            handleIntent(intent)
        } else {
            webView.restoreState(savedInstanceState)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        val uri = intent?.data ?: return
        if (uri.scheme == "com.bubblyfi.laundry" && uri.host == "auth-callback") {
            pendingAuthCallbackUrl = uri.toString()
            flushPendingAuthCallback()
        }
    }

    private fun flushPendingAuthCallback() {
        val url = pendingAuthCallbackUrl ?: return
        val escaped = url.replace("\\", "\\\\").replace("'", "\\'")
        webView.evaluateJavascript("window.onAuthCallback && window.onAuthCallback('$escaped')", null)
        pendingAuthCallbackUrl = null
    }

    private fun openExternal(uri: Uri): Boolean {
        return try {
            val intent = when (uri.scheme?.lowercase(Locale.ROOT)) {
                "intent" -> Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME)
                "mailto", "tel", "sms", "geo", "market" -> Intent(Intent.ACTION_VIEW, uri)
                "http", "https" -> Intent(Intent.ACTION_VIEW, uri)
                else -> Intent(Intent.ACTION_VIEW, uri)
            }
            startActivity(intent)
            true
        } catch (error: Exception) {
            Toast.makeText(this, "Unable to open this link.", Toast.LENGTH_SHORT).show()
            true
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        fileCallback?.onReceiveValue(null)
        fileCallback = null
        textToSpeech?.stop()
        textToSpeech?.shutdown()
        webView.removeJavascriptInterface("AndroidBridge")
        webView.destroy()
        super.onDestroy()
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            val engine = textToSpeech ?: return
            val candidates = listOf(Locale("en", "PH"), Locale("fil", "PH"), Locale.US)
            val selected = candidates.firstOrNull { engine.isLanguageAvailable(it) >= TextToSpeech.LANG_AVAILABLE }
            if (selected != null) engine.language = selected
            engine.setSpeechRate(0.90f)
            engine.setPitch(0.98f)
            ttsReady = true
        }
    }

    inner class AndroidBridge {
        @JavascriptInterface
        fun speak(text: String?, languageTag: String?): Boolean {
            val clean = text?.trim()?.take(500) ?: return false
            if (!ttsReady) return false
            runOnUiThread {
                val locale = when {
                    languageTag?.startsWith("fil", ignoreCase = true) == true -> Locale("fil", "PH")
                    languageTag?.startsWith("en-PH", ignoreCase = true) == true -> Locale("en", "PH")
                    else -> Locale("en", "PH")
                }
                textToSpeech?.language = locale
                textToSpeech?.speak(clean, TextToSpeech.QUEUE_FLUSH, null, "bubblyfi-alert")
            }
            return true
        }

        @JavascriptInterface
        fun versionName(): String = BuildConfig.VERSION_NAME

        @JavascriptInterface
        fun openExternalUrl(url: String?) {
            val uri = url?.let(Uri::parse) ?: return
            runOnUiThread { openExternal(uri) }
        }

        @JavascriptInterface
        fun getFcmToken() {
            if (FirebaseApp.getApps(this@MainActivity).isEmpty()) {
                runOnUiThread { webView.evaluateJavascript("window.onFcmToken && window.onFcmToken(null)", null) }
                return
            }
            FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                val token = if (task.isSuccessful) task.result else null
                if (!token.isNullOrBlank()) {
                    getSharedPreferences(BubblyfiMessagingService.PREFS, MODE_PRIVATE).edit()
                        .putString(BubblyfiMessagingService.KEY_TOKEN, token)
                        .apply()
                }
                runOnUiThread {
                    val jsToken = token?.let { "\"${it.replace("\"", "")}\"" } ?: "null"
                    webView.evaluateJavascript("window.onFcmToken && window.onFcmToken($jsToken);window.dispatchEvent(new CustomEvent('bubblyfi:fcm-token',{detail:{token:$jsToken}}))", null)
                }
            }
        }

        @JavascriptInterface
        fun firebaseToken(): String = getSharedPreferences(BubblyfiMessagingService.PREFS, MODE_PRIVATE)
            .getString(BubblyfiMessagingService.KEY_TOKEN, "") ?: ""

        @JavascriptInterface
        fun customerArea(): String = getSharedPreferences("bubblyfi_customer_native", MODE_PRIVATE)
            .getString("customer_area", "unknown") ?: "unknown"

        @JavascriptInterface
        fun setCustomerArea(area: String?) {
            val clean = area?.trim()?.take(40).orEmpty().ifBlank { "unknown" }
            getSharedPreferences("bubblyfi_customer_native", MODE_PRIVATE).edit()
                .putString("customer_area", clean)
                .apply()
        }

        @JavascriptInterface
        fun registeredBookings(): String = getSharedPreferences("bubblyfi_customer_native", MODE_PRIVATE)
            .getString("registered_bookings", "[]") ?: "[]"

        @JavascriptInterface
        fun registerBookingDetails(requestId: String?, requestNo: String?, phone: String?, area: String?, json: String?) {
            val parsed = try { JSONObject(json ?: "{}") } catch (_: Exception) { JSONObject() }
            parsed.put("request_id", requestId.orEmpty())
            parsed.put("request_no", requestNo.orEmpty())
            parsed.put("phone", phone.orEmpty())
            parsed.put("area", area.orEmpty())
            val preferences = getSharedPreferences("bubblyfi_customer_native", MODE_PRIVATE)
            val previous = try { JSONArray(preferences.getString("registered_bookings", "[]")) } catch (_: Exception) { JSONArray() }
            val merged = JSONArray().put(parsed)
            for (index in 0 until previous.length()) {
                if (merged.length() >= 100) break
                val item = previous.optJSONObject(index) ?: continue
                val sameId = requestId?.isNotBlank() == true && item.optString("request_id") == requestId
                val sameNumber = requestNo?.isNotBlank() == true && item.optString("request_no") == requestNo
                if (!sameId && !sameNumber) merged.put(item)
            }
            preferences.edit()
                .putString("registered_bookings", merged.toString())
                .putString("customer_area", area?.trim().orEmpty().ifBlank { "unknown" })
                .apply()
        }

        @JavascriptInterface
        fun setNotificationPrefs(sound: Boolean, vibrate: Boolean) {
            getSharedPreferences(BubblyfiMessagingService.PREFS, MODE_PRIVATE).edit()
                .putBoolean(BubblyfiMessagingService.KEY_SOUND, sound)
                .putBoolean(BubblyfiMessagingService.KEY_VIBRATE, vibrate)
                .apply()
        }
    }
}
