package com.prizmprograms.ekz.data

import com.prizmprograms.ekz.model.Place
import com.prizmprograms.ekz.model.RouteInfo
import java.net.URLDecoder

/**
 * 展開済みの Googleマップ経路URL を解析する純粋関数。ネットワークは触らない。
 *
 * 想定する形:
 *   https://www.google.com/maps/dir/<出発地>/<経由地...>/<目的地>/@lat,lng,17z/data=!4m12!...
 *
 * パス部分(地点)は安定。data= の中身は非公開・未ドキュメントなので best-effort で拾い、
 * 取れなくても全体が壊れないようにする。
 */
object RouteLinkParser {

    private val COORD_PAIR = Regex("!3d(-?[0-9.]+)!4d(-?[0-9.]+)")
    private val TRAVEL_MODE = Regex("!3e([0-9])")
    private val ROUTE_INDEX = Regex("!5i([0-9]+)")

    private val MODES = mapOf(
        "0" to "driving",
        "1" to "bicycling",
        "2" to "walking",
        "3" to "transit",
    )

    /** 共有本文(場所名 + 改行 + URL など)から最初のURLを取り出す */
    fun extractUrl(sharedText: String): String? =
        sharedText.lines()
            .flatMap { it.split(" ") }
            .map { it.trim() }
            .firstOrNull { it.startsWith("http://") || it.startsWith("https://") }

    fun parse(expandedUrl: String): RouteInfo? {
        val withoutQuery = expandedUrl.substringBefore("?")
        val marker = "/maps/dir/"
        val idx = withoutQuery.indexOf(marker)
        if (idx < 0) return null

        val tail = withoutQuery.substring(idx + marker.length)
        val dataPart = tail.split("/").firstOrNull { it.startsWith("data=") }.orEmpty()

        // 地点はパスのセグメント。@... (地図の中心) と data=... は地点ではない
        val places = tail.split("/")
            .filter { it.isNotBlank() }
            .filterNot { it.startsWith("@") || it.startsWith("data=") }
            .map { decode(it) }
            .map { toPlace(it) }

        if (places.size < 2) return null

        val coordPairs = COORD_PAIR.findAll(dataPart)
            .mapNotNull { m ->
                val la = m.groupValues[1].toDoubleOrNull()
                val ln = m.groupValues[2].toDoubleOrNull()
                if (la != null && ln != null) la to ln else null
            }
            .toList()

        val filled = fillCoords(places, coordPairs)

        val mode = TRAVEL_MODE.find(dataPart)?.groupValues?.get(1)
        val routeIndex = ROUTE_INDEX.find(dataPart)?.groupValues?.get(1)?.toIntOrNull()

        return RouteInfo(
            origin = filled.first(),
            destination = filled.last(),
            waypoints = filled.subList(1, filled.size - 1),
            travelMode = MODES[mode] ?: "driving",
            routeIndex = routeIndex,
            expandedUrl = expandedUrl,
        )
    }

    /**
     * data= から拾った座標を、座標を持たない地点に前から順に埋める。
     * 数が合わないときは、最後の1件(= 目的地)だけに使う。非公開仕様なので欲張らない。
     */
    private fun fillCoords(places: List<Place>, pairs: List<Pair<Double, Double>>): List<Place> {
        if (pairs.isEmpty()) return places
        val missing = places.count { !it.hasCoords }

        if (missing == pairs.size) {
            var i = 0
            return places.map { p ->
                if (p.hasCoords) p else pairs[i++].let { p.copy(lat = it.first, lng = it.second) }
            }
        }

        val last = places.last()
        if (last.hasCoords) return places
        val (la, ln) = pairs.last()
        return places.dropLast(1) + last.copy(lat = la, lng = ln)
    }

    private fun toPlace(decoded: String): Place {
        val parts = decoded.split(",")
        if (parts.size == 2) {
            val la = parts[0].trim().toDoubleOrNull()
            val ln = parts[1].trim().toDoubleOrNull()
            if (la != null && ln != null) {
                return Place(raw = decoded, name = null, lat = la, lng = ln)
            }
        }
        return Place(raw = decoded, name = decoded.replace("+", " "), lat = null, lng = null)
    }

    private fun decode(s: String): String =
        runCatching { URLDecoder.decode(s, "UTF-8") }.getOrDefault(s)
}
