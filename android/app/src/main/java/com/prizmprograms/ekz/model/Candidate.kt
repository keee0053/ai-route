package com.prizmprograms.ekz.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

/**
 * 候補に付けるタグ。固定15個。**サーバの jev.js の TAGS と同じ並び。片方だけ変えないこと。**
 */
enum class Tag(val label: String) {
    QUIET("静か"),
    LIVELY("賑やか"),
    QUEUE("並ぶ"),
    NO_WAIT("すぐ入れる"),
    MEAL("食事"),
    SWEETS("甘いもの"),
    SNACK("軽食"),
    OUTDOOR("屋外"),
    INDOOR("屋内"),
    VIEW("景色がいい"),
    PHOTOGENIC("映える"),
    EXPENSIVE("高い"),
    CHEAP("安い"),
    SHORT("短時間"),
    LONG_STAY("長居できる");

    companion object {
        fun fromLabel(label: String): Tag? = entries.firstOrNull { it.label == label }
    }
}

/**
 * ルート沿いの寄り道候補。サーバの /search が返す形。
 *
 * tags はサーバの /tag を呼んだときだけ入る(表示する1件だけ取りに行く)。
 */
@Serializable
data class Candidate(
    val id: String,
    val name: String,
    val category: String = "",
    val lat: Double? = null,
    val lng: Double? = null,
    val rating: Double? = null,
    val reviewCount: Int? = null,
    val priceRange: String? = null,
    val photoName: String? = null,
    val reviews: List<String> = emptyList(),
    val detourMinutes: Int = 0,
    @Transient val tags: Set<Tag> = emptySet(),
) {
    /**
     * 経由地として Maps URLs に渡す形にする。
     *
     * 座標があれば座標、無ければ場所名を渡す (Google 側が解決してくれる)。
     * TODO: place_id が取れるようになったら waypoint_place_ids を使う。
     */
    fun toPlace(): Place = Place(raw = name, name = name, lat = lat, lng = lng)
}
