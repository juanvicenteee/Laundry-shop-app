package com.bubblyfi.laundry

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class BubblyfiMessagingService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        prefs().edit().putString(KEY_TOKEN, token).putBoolean(KEY_TOKEN_DIRTY, true).apply()
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        val title = message.notification?.title ?: message.data["title"] ?: "Bubbly-fi"
        val body = message.notification?.body ?: message.data["body"] ?: ""
        showNotification(title, body)
    }

    private fun prefs() = getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun showNotification(title: String, body: String) {
        val soundOn = prefs().getBoolean(KEY_SOUND, true)
        val vibrateOn = prefs().getBoolean(KEY_VIBRATE, true)
        val channelId = channelIdFor(soundOn, vibrateOn)
        ensureChannel(channelId, soundOn, vibrateOn)

        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, launchIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_HIGH)

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            if (soundOn) builder.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION))
            if (vibrateOn) builder.setVibrate(longArrayOf(0, 250, 250, 250))
        }

        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(System.currentTimeMillis().toInt(), builder.build())
    }

    private fun channelIdFor(soundOn: Boolean, vibrateOn: Boolean): String = when {
        soundOn && vibrateOn -> "bubblyfi_full"
        soundOn -> "bubblyfi_sound_only"
        vibrateOn -> "bubblyfi_vibrate_only"
        else -> "bubblyfi_silent"
    }

    private fun ensureChannel(channelId: String, soundOn: Boolean, vibrateOn: Boolean) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (manager.getNotificationChannel(channelId) != null) return
        val channel = NotificationChannel(channelId, "Bubbly-fi updates", NotificationManager.IMPORTANCE_HIGH).apply {
            enableVibration(vibrateOn)
            if (vibrateOn) vibrationPattern = longArrayOf(0, 250, 250, 250)
            if (!soundOn) setSound(null, null)
        }
        manager.createNotificationChannel(channel)
    }

    companion object {
        const val PREFS = "bubblyfi_notif_prefs"
        const val KEY_TOKEN = "fcm_token"
        const val KEY_TOKEN_DIRTY = "fcm_token_dirty"
        const val KEY_SOUND = "notif_sound"
        const val KEY_VIBRATE = "notif_vibrate"
    }
}
