package com.prizmprograms.ekz.model

/**
 * タグや項目の3状態。タップするたびに 中立 → 嫌(赤) → いい感じ(緑) → 中立 と回る。
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

/** 赤(嫌)のときだけ選べる、どちら向きが嫌かの指定 */
enum class Side { LOW, HIGH }

/** 数値で表される項目 */
enum class Extreme(val lowLabel: String, val highLabel: String, val noun: String) {
    DETOUR("短すぎる", "長すぎる", "寄り道の時間"),
    ARRIVE("近すぎる", "遠すぎる", "そこに着くまでの時間"),
    PRICE("安すぎる", "高すぎる", "価格"),
}

/** 項目ごとの状態。嫌(赤)のときだけ side を選べる */
data class ExtremeState(val vote: Vote = Vote.NEUTRAL, val side: Side? = null)

/**
 * 寄り道に対するユーザーの反応。これを言葉にしてサーバに渡し、次の候補を選ばせる。
 */
data class Feedback(
    val tags: Map<String, Vote> = emptyMap(),
    val extremes: Map<Extreme, ExtremeState> = emptyMap(),
) {
    fun voteOf(tag: String): Vote = tags[tag] ?: Vote.NEUTRAL

    fun stateOf(e: Extreme): ExtremeState = extremes[e] ?: ExtremeState()

    fun toggleTag(tag: String): Feedback = copy(tags = tags + (tag to voteOf(tag).next()))

    /** 項目そのものを押す。赤を抜けるときは選んでいた向きも消す */
    fun toggleExtreme(e: Extreme): Feedback {
        val next = stateOf(e).vote.next()
        return copy(extremes = extremes + (e to ExtremeState(next, null)))
    }

    /** 「短すぎる/長すぎる」。排他。同じものをもう一度押すと解除 */
    fun chooseSide(e: Extreme, side: Side): Feedback {
        val cur = stateOf(e)
        if (cur.vote != Vote.BAD) return this
        return copy(extremes = extremes + (e to cur.copy(side = if (cur.side == side) null else side)))
    }

    val badTags: List<String> get() = tags.filterValues { it == Vote.BAD }.keys.toList()
    val goodTags: List<String> get() = tags.filterValues { it == Vote.GOOD }.keys.toList()

    /** サーバに渡す、数値項目への反応の言葉 */
    val extremeNotes: List<String>
        get() = extremes.mapNotNull { (e, s) ->
            when {
                s.vote == Vote.GOOD -> "${e.noun}はこれくらいがちょうどいい"
                s.vote == Vote.BAD && s.side == Side.LOW -> "${e.noun}が${e.lowLabel}のは避けたい"
                s.vote == Vote.BAD && s.side == Side.HIGH -> "${e.noun}が${e.highLabel}のは避けたい"
                s.vote == Vote.BAD -> "${e.noun}がこれでは良くない"
                else -> null
            }
        }

    val hasAny: Boolean get() =
        tags.values.any { it != Vote.NEUTRAL } || extremes.values.any { it.vote != Vote.NEUTRAL }
}
