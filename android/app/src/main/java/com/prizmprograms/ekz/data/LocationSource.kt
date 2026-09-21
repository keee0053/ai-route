package com.prizmprograms.ekz.data

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.CancellationSignal
import androidx.core.content.ContextCompat
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

/**
 * 現在地を取る。
 *
 * Play Services を足さずに済むよう LocationManager を使う。
 * 精度は数十mあれば十分(ルート上のどこにいるかが分かればよい)。
 */
object LocationSource {

    fun hasPermission(context: Context): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

    /**
     * 現在地を取る。取れなければ null(呼び出し側は出発地基準に落とす)。
     *
     * まず直近の位置を見る。無ければ1回だけ能動的に測位する。
     * 一度も測位していない端末やエミュレータでは前者が null になるため、後者が要る。
     */
    @SuppressLint("MissingPermission")
    suspend fun current(context: Context, timeoutMs: Long = 6000): Location? {
        if (!hasPermission(context)) return null
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null

        // 走行中に使うので、古い測位結果は信用しない。2分以内のものだけ使う
        lastKnown(lm)?.let { if (System.currentTimeMillis() - it.time <= FRESH_MS) return it }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return lastKnown(lm)

        return withTimeoutOrNull(timeoutMs) {
            val providers = listOf(
                LocationManager.FUSED_PROVIDER,
                LocationManager.GPS_PROVIDER,
                LocationManager.NETWORK_PROVIDER,
            ).filter { runCatching { lm.isProviderEnabled(it) }.getOrDefault(false) }

            for (p in providers) {
                val loc = requestOnce(context, lm, p)
                if (loc != null) return@withTimeoutOrNull loc
            }
            null
        } ?: lastKnown(lm)
    }

    /** これより古い測位結果は使わない */
    private const val FRESH_MS = 2 * 60 * 1000L

    @SuppressLint("MissingPermission")
    private fun lastKnown(lm: LocationManager): Location? {
        val providers = listOf(
            LocationManager.FUSED_PROVIDER,
            LocationManager.GPS_PROVIDER,
            LocationManager.NETWORK_PROVIDER,
        )
        var best: Location? = null
        for (p in providers) {
            val loc = runCatching { lm.getLastKnownLocation(p) }.getOrNull() ?: continue
            if (best == null || loc.time > best.time) best = loc
        }
        return best
    }

    @SuppressLint("MissingPermission")
    private suspend fun requestOnce(
        context: Context,
        lm: LocationManager,
        provider: String,
    ): Location? =
        suspendCancellableCoroutine { cont ->
            val signal = CancellationSignal()
            cont.invokeOnCancellation { runCatching { signal.cancel() } }
            runCatching {
                lm.getCurrentLocation(provider, signal, context.mainExecutor) { loc ->
                    if (cont.isActive) cont.resume(loc)
                }
            }.onFailure { if (cont.isActive) cont.resume(null) }
        }
}
