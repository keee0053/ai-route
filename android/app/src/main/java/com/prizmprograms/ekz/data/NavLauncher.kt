package com.prizmprograms.ekz.data

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import com.prizmprograms.ekz.model.Place
import com.prizmprograms.ekz.model.RouteInfo

/**
 * 決まった経由地を入れて Googleマップのナビを起動する。
 *
 * Maps URLs (api=1) は公式仕様。経由地の区切りは | で、
 * 上限は「モバイルブラウザで3つ、それ以外で9つ」。ここでは安全側で3つに絞る。
 */
object NavLauncher {

    private const val MAPS_PACKAGE = "com.google.android.apps.maps"
    private const val MAX_WAYPOINTS = 3

    fun buildUrl(info: RouteInfo, waypoints: List<Place>): String {
        val all = (info.waypoints + waypoints).take(MAX_WAYPOINTS)

        val builder = Uri.parse("https://www.google.com/maps/dir/")
            .buildUpon()
            .appendQueryParameter("api", "1")
            .appendQueryParameter("origin", info.origin.toQuery())
            .appendQueryParameter("destination", info.destination.toQuery())

        if (all.isNotEmpty()) {
            builder.appendQueryParameter("waypoints", all.joinToString("|") { it.toQuery() })
        }
        builder.appendQueryParameter("travelmode", info.travelMode)

        return builder.build().toString()
    }

    fun launch(context: Context, url: String) {
        val uri = Uri.parse(url)

        // まず Googleマップアプリを狙う
        val direct = Intent(Intent.ACTION_VIEW, uri).setPackage(MAPS_PACKAGE)
        if (direct.resolveActivity(context.packageManager) != null) {
            context.startActivity(direct)
            return
        }

        // 無ければ既定のブラウザ等に投げる
        val fallback = Intent(Intent.ACTION_VIEW, uri)
        if (fallback.resolveActivity(context.packageManager) != null) {
            context.startActivity(fallback)
        } else {
            Toast.makeText(context, "地図アプリが見つかりませんでした", Toast.LENGTH_SHORT).show()
        }
    }
}
