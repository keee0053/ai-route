package com.prizmprograms.ekz.model

/**
 * 「1件ずつ見せて、嫌なところにNGを付けると次が変わる」画面の状態。
 *
 * 消すのは候補そのものではなく「属性」。
 * NG を付けたタグはサーバの /next に渡して Jev に避けさせる。
 * 時間の上限だけはアプリ側で落とせるのでローカルで絞る。
 */
data class SearchUiState(
    val all: List<Candidate> = emptyList(),
    val current: Candidate? = null,
    val seen: Set<String> = emptySet(),

    val badTags: Set<Tag> = emptySet(),
    val maxDetour: Int? = null,
    /** 時間NGを押した候補のID。その候補を見ている間だけ NG 表示にする */
    val detourBadFor: String? = null,

    val request: String = "",

    /** 目的地までの残り時間(寄り道を除く)。/search が返す実測値 */
    val baseMinutes: Int = 0,

    val loading: Boolean = false,
    val message: String? = null,
    val error: String? = null,
) {
    val started: Boolean get() = current != null || seen.isNotEmpty() || loading

    val etaMinutes: Int get() = baseMinutes + (current?.detourMinutes ?: 0)

    val hasFeedback: Boolean get() = badTags.isNotEmpty() || maxDetour != null

    val detourIsBad: Boolean get() = current != null && current.id == detourBadFor

    val detourNote: String? get() = maxDetour?.let { "$it 分未満で探しています" }

    val avoiding: String?
        get() {
            val parts = badTags.map { it.label } + listOfNotNull(maxDetour?.let { "+$it 分以上" })
            return if (parts.isEmpty()) null else "避けているもの: " + parts.joinToString(" / ")
        }

    /** 次の候補を選ぶときに渡す母集団 */
    fun pool(): List<Candidate> = all
        .filterNot { it.id in seen }
        .filter { maxDetour == null || it.detourMinutes < maxDetour }
}
