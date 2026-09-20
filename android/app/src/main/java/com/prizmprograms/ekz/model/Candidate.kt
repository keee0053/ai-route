package com.prizmprograms.ekz.model

/**
 * 候補に付けるタグ。固定15個。
 *
 * 本番では起動時に1回だけ LLM を呼び、口コミ本文を読ませてこのリストから選ばせる。
 * 消去の判定は全部ローカルで行うので、以降 LLM は呼ばない。
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
 * 全候補に Routes API を叩くと重いので、概算
 *   (ルート最近傍点からの直線距離 x 2) / 40km/h + 滞在15分
 * で出し、最終的に残った1件だけ正確に計算し直す。
 */
data class Candidate(
    val id: String,
    val name: String,
    val category: String,
    val lat: Double,
    val lng: Double,
    val rating: Double? = null,
    val reviewCount: Int? = null,
    val detourMinutes: Int,
    val tags: Set<Tag> = emptySet(),
    val hook: String? = null,
) {
    fun toPlace(): Place = Place(raw = name, name = name, lat = lat, lng = lng)
}
