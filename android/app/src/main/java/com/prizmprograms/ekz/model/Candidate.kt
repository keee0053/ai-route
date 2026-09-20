package com.prizmprograms.ekz.model

/**
 * 候補に付けるタグ。固定15個。
 *
 * 本番では起動時に1回だけ LLM を呼び、口コミ本文を読ませてこのリストから選ばせる。
 * 以降の絞り込みは全部ローカルで行う。
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
    LONG_STAY("長居できる"),
}

/**
 * ルート沿いの寄り道候補。
 *
 * detourMinutes は「この寄り道で所要時間が何分増えるか」。
 * 全候補に Routes API を叩くと重いので概算で出し、
 * 最終的に選ばれた1件だけ正確に計算し直す。
 */
data class Candidate(
    val id: String,
    val name: String,
    val category: String,
    val lat: Double? = null,
    val lng: Double? = null,
    val rating: Double? = null,
    val reviewCount: Int? = null,
    val detourMinutes: Int,
    val priceRange: String? = null,
    val photoUrl: String? = null,
    val tags: Set<Tag> = emptySet(),
    val hook: String? = null,
) {
    /**
     * 経由地として Maps URLs に渡す形にする。
     *
     * 座標があれば座標、無ければ場所名を渡す (Google 側が解決してくれる)。
     * TODO: Places API から place_id が取れるようになったら waypoint_place_ids を使う。
     * 名前での解決は、同名の店が複数あると別の場所に飛ぶ可能性がある。
     */
    fun toPlace(): Place = Place(raw = name, name = name, lat = lat, lng = lng)
}
