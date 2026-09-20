package com.prizmprograms.ekz.model

/**
 * タグやボタンの3状態。
 *
 * タップするたびに 中立 → 嫌(赤) → いい感じ(緑) → 中立 と回る。
 */
enum class Vote {
    NEUTRAL,
    BAD,
    GOOD;

    fun next(): Vote = when (this) {
        NEUTRAL -> BAD
        BAD -> GOOD
        GOOD -> NEUTRAL
    }
}

/**
 * 数値の項目に対する不満。
 * 「追加でかかる時間」などを押すと、この2択が出る。
 */
enum class Extreme(val shortLabel: String, val longLabel: String) {
    DETOUR("短すぎる", "長すぎる"),
    ETA("早く着きすぎる", "遅すぎる"),
    PRICE("安すぎる", "高すぎる"),
}

/**
 * 寄り道に対するユーザーの反応をまとめたもの。
 * これを /next に渡して、次の候補を選ばせる。
 */
data class Feedback(
    /** タグの文字列 -> 3状態 */
    val tags: Map<String, Vote> = emptyMap(),
    /** 数値項目 -> (短い側の票, 長い側の票) */
    val extremes: Map<Extreme, Pair<Vote, Vote>> = emptyMap(),
    /** 展開して選択肢を出している項目 */
    val expanded: Set<Extreme> = emptySet(),
) {
    fun voteOf(tag: String): Vote = tags[tag] ?: Vote.NEUTRAL

    fun voteOf(e: Extreme, low: Boolean): Vote =
        extremes[e]?.let { if (low) it.first else it.second } ?: Vote.NEUTRAL

    fun toggleTag(tag: String): Feedback =
        copy(tags = tags + (tag to voteOf(tag).next()))

    fun toggleExtreme(e: Extreme, low: Boolean): Feedback {
        val cur = extremes[e] ?: (Vote.NEUTRAL to Vote.NEUTRAL)
        val next = if (low) cur.copy(first = cur.first.next()) else cur.copy(second = cur.second.next())
        return copy(extremes = extremes + (e to next))
    }

    fun toggleExpanded(e: Extreme): Feedback =
        copy(expanded = if (e in expanded) expanded - e else expanded + e)

    val badTags: List<String> get() = tags.filterValues { it == Vote.BAD }.keys.toList()
    val goodTags: List<String> get() = tags.filterValues { it == Vote.GOOD }.keys.toList()

    /** サーバに渡す、数値項目への不満の言葉 */
    val extremeNotes: List<String>
        get() = extremes.flatMap { (e, v) ->
            buildList {
                if (v.first == Vote.BAD) add("${label(e)}が${e.shortLabel}のは避けたい")
                if (v.first == Vote.GOOD) add("${label(e)}は${e.shortLabel}くらいがいい")
                if (v.second == Vote.BAD) add("${label(e)}が${e.longLabel}のは避けたい")
                if (v.second == Vote.GOOD) add("${label(e)}は${e.longLabel}くらいがいい")
            }
        }

    val hasAny: Boolean get() =
        tags.values.any { it != Vote.NEUTRAL } ||
            extremes.values.any { it.first != Vote.NEUTRAL || it.second != Vote.NEUTRAL }

    private fun label(e: Extreme) = when (e) {
        Extreme.DETOUR -> "寄り道の時間"
        Extreme.ETA -> "到着までの時間"
        Extreme.PRICE -> "価格"
    }
}
