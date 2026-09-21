package com.prizmprograms.ekz.model

/**
 * 「1件ずつ見せて、嫌なところ・いい所に印を付けると次が変わる」画面の状態。
 *
 * 絞り込みはアプリ側でやらず、反応をそのままサーバに渡して Jev に選ばせる。
 * 条件で機械的に弾くと行き止まりになりやすく、「気分で選ぶ」という建て付けとも合わない。
 */
data class SearchUiState(
    val genre: Genre? = null,
    val all: List<Candidate> = emptyList(),
    val current: Candidate? = null,
    val seen: Set<String> = emptySet(),
    val feedback: Feedback = Feedback(),
    val request: String = "",

    /** 目的地までの残り時間(寄り道を除く)。/search が返す実測値 */
    val baseMinutes: Int = 0,

    val loading: Boolean = false,
    val message: String? = null,
    val error: String? = null,
) {
    val started: Boolean get() = current != null || seen.isNotEmpty() || loading || error != null

    /** 寄り道した場合の合計所要時間 */
    val totalMinutes: Int get() = baseMinutes + (current?.detourMinutes ?: 0)

    /** 今の反応を1行で。画面に出してユーザーに見せる */
    val summaryOfFeedback: String?
        get() {
            val bad = feedback.badTags
            val good = feedback.goodTags
            val parts = buildList {
                if (good.isNotEmpty()) add("いい感じ: " + good.joinToString(" / "))
                if (bad.isNotEmpty()) add("避けたい: " + bad.joinToString(" / "))
                addAll(feedback.extremeNotes)
            }
            return parts.ifEmpty { null }?.joinToString("  ")
        }

    fun pool(): List<Candidate> = all.filterNot { it.id in seen }
}
