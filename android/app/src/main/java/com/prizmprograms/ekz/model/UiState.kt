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

    /** なぜこの1件を選んだかの一言 */
    val reason: String? = null,

    /** 見てきた順。「ひとつ前に戻る」に使う */
    val history: List<Candidate> = emptyList(),
    val feedback: Feedback = Feedback(),
    val request: String = "",

    /** 目的地までの残り時間(寄り道を除く)。/search が返す実測値 */
    val baseMinutes: Int = 0,

    /** 現在地がルート全体のどこにいるか(0〜1)。取れなければ null = 出発地基準 */
    val myRatio: Double? = null,

    /** 現在地がこのルート上にあるか。デモで「移動中」と言えるかの判定 */
    val onRoute: Boolean = false,

    val loading: Boolean = false,
    /** 探している最中に出す進捗の文言 */
    val loadingStep: String? = null,
    val message: String? = null,
    val error: String? = null,
) {
    val started: Boolean get() = current != null || seen.isNotEmpty() || loading || error != null

    /**
     * その候補に着くまでの時間。現在地が取れていればそこからの残り、
     * 取れていなければ出発地からの時間(サーバの値)。
     */
    fun minutesTo(c: Candidate): Int {
        val mine = myRatio ?: return c.minutesToArrive
        val remain = ((c.routeRatio - mine) * baseMinutes).toInt()
        val detour = ((c.offRouteKm / 40.0) * 60).toInt()
        return remain + detour
    }

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

    val canGoBack: Boolean get() = history.isNotEmpty()

    fun pool(): List<Candidate> = all.filterNot { it.id in seen }
}
