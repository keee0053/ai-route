package com.prizmprograms.ekz.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

/**
 * ルート沿いの寄り道候補。サーバの /search が返す形。
 *
 * tags は固定リストではなく、**その場所の口コミから AI が都度10個ほど作る**。
 * サーバの /tag を呼んだときだけ入る(表示する1件だけ取りに行く)。
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
    val minutesToArrive: Int = 0,
    /** ルート全体のどこにある候補か(0〜1) */
    val routeRatio: Double = 0.0,
    val offRouteKm: Double = 0.0,
    @Transient val tags: List<String> = emptyList(),
) {
    /**
     * 経由地として Maps URLs に渡す形にする。
     * 座標があれば座標、無ければ場所名(Google 側が解決してくれる)。
     */
    fun toPlace(): Place = Place(raw = name, name = name, lat = lat, lng = lng)
}

/** スタート画面で選ぶ「気分」。カテゴリ名にしないこと */
enum class Genre(val id: String, val label: String) {
    MEAL("meal", "ごはん"),
    SWEETS("sweets", "甘いもの"),
    VIEW("view", "景色を見たい"),
    SIGHTSEEING("sightseeing", "ちょっと観光"),
    REST("rest", "ひと休み"),
}
