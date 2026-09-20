package com.prizmprograms.ekz.model

/**
 * 1回の消去で何が起きたか。Undo と理由表示に使う。
 */
data class Elimination(
    val target: Candidate,
    val alsoRemoved: List<Candidate>,
    val reasonTag: Tag?,
) {
    /** 「"並ぶ" をまとめて消しました」 */
    val reasonText: String
        get() = when {
            alsoRemoved.isEmpty() -> "${target.name} を消しました"
            reasonTag != null -> "「${reasonTag.label}」を ${alsoRemoved.size + 1} 件まとめて消しました"
            else -> "${alsoRemoved.size + 1} 件まとめて消しました"
        }
}

/**
 * 消去画面の状態。
 *
 * keptTags は Undo で戻されたタグ。以後そのタグでは連鎖消去しない
 * (ユーザーが「それは残したい」と言ったのと同じなので)。
 */
data class EliminateUiState(
    val alive: List<Candidate> = emptyList(),
    val removed: List<Candidate> = emptyList(),
    val keptTags: Set<Tag> = emptySet(),
    val last: Elimination? = null,
    val message: String? = null,
) {
    val isDecided: Boolean get() = alive.size == 1
    val decided: Candidate? get() = alive.singleOrNull()
    val canUndo: Boolean get() = last != null
}
