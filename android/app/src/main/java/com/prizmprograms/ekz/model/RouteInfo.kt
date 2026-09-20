package com.prizmprograms.ekz.model

/**
 * ルート上の1地点。
 * Googleマップの共有リンクでは、地点は「場所名」か「緯度,経度」のどちらかで入っている。
 */
data class Place(
    val raw: String,
    val name: String?,
    val lat: Double?,
    val lng: Double?,
) {
    val hasCoords: Boolean get() = lat != null && lng != null

    /** Maps URLs の origin / destination / waypoints に渡す文字列 */
    fun toQuery(): String = if (hasCoords) "$lat,$lng" else raw

    override fun toString(): String =
        if (hasCoords) "${name ?: raw} ($lat, $lng)" else (name ?: raw)
}

/**
 * 共有リンクから取り出したルート情報。
 *
 * パス由来(origin / destination / waypoints)は安定。
 * travelMode と routeIndex は data= の非公開エンコード由来なので、無いこともある。
 */
data class RouteInfo(
    val origin: Place,
    val destination: Place,
    val waypoints: List<Place>,
    val travelMode: String,
    val routeIndex: Int?,
    val expandedUrl: String,
)
