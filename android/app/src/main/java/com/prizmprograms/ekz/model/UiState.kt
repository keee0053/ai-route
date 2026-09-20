package com.prizmprograms.ekz.model

/**
 * 「1件ずつ見せて、嫌なところにバッドを付けると次が変わる」画面の状態。
 *
 * 消すのは候補そのものではなく「属性」。
 * バッドを付けたタグや所要時間が、次の候補を選ぶときの除外条件になる。
 */
data class SearchUiState(
    val all: List<Candidate> = emptyList(),
    val current: Candidate? = null,
    val seen: Set<String> = emptySet(),

    /** バッドを付けたタグ。これを持つ候補は出さない */
    val badTags: Set<Tag> = emptySet(),

    /** 「追加でかかる時間」にバッドを付けたときの上限。これ未満のものだけ出す */
    val maxDetour: Int? = null,

    /** 時間NGを押した候補のID。その候補を見ている間だけ NG 表示にする */
    val detourBadFor: String? = null,

    /** AIへの追加要望 */
    val request: String = "",

    /** 目的地までの残り時間(寄り道を除く)。TODO: Routes API から取る。今はダミー */
    val baseMinutes: Int = 110,

    val message: String? = null,
) {
    val started: Boolean get() = current != null || seen.isNotEmpty()

    /** 寄り道した場合に目的地へ着くまでの時間 */
    val etaMinutes: Int get() = baseMinutes + (current?.detourMinutes ?: 0)

    val hasFeedback: Boolean get() = badTags.isNotEmpty() || maxDetour != null

    /** 今この候補の「追加でかかる時間」に NG が付いているか */
    val detourIsBad: Boolean get() = current != null && current.id == detourBadFor

    /** 探すときに使っている上限の説明。NG とは別に常に出す */
    val detourNote: String? get() = maxDetour?.let { "$it 分未満で探しています" }

    /** 今避けている条件。画面に出してユーザーに見せる */
    val avoiding: String?
        get() {
            val parts = badTags.map { it.label } + listOfNotNull(maxDetour?.let { "+$it 分以上" })
            return if (parts.isEmpty()) null else "避けているもの: " + parts.joinToString(" / ")
        }
}
