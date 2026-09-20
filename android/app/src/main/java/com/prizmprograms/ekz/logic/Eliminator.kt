package com.prizmprograms.ekz.logic

import com.prizmprograms.ekz.model.Candidate
import com.prizmprograms.ekz.model.Elimination
import com.prizmprograms.ekz.model.EliminateUiState
import com.prizmprograms.ekz.model.Tag

/**
 * 連鎖消去。この製品の心臓。
 *
 * 1件「無し」にすると、AI が付けたタグを手がかりに似たものをまとめて消す。
 * 判定は全部ローカルなので一瞬で終わる (LLM は起動時のタグ付け1回だけ)。
 *
 * 暴走防止:
 *   - 1回で消えるのは残り件数の MAX_RATIO まで
 *   - keptTags (Undo で戻されたタグ) を持つものは消さない
 *   - 結果が 0 件になる場合は巻き戻す
 */
object Eliminator {

    /** これ以上重なっていたら「似ている」とみなす */
    private const val OVERLAP_THRESHOLD = 0.6

    /** 1回の消去で消していい割合の上限 */
    private const val MAX_RATIO = 0.4

    fun eliminate(state: EliminateUiState, target: Candidate): EliminateUiState {
        val rest = state.alive.filter { it.id != target.id }
        if (rest.isEmpty()) {
            return state.copy(message = "最後の1件なので消せません")
        }

        val targetTags = target.tags
        val scored = if (targetTags.isEmpty()) {
            emptyList()
        } else {
            rest.asSequence()
                .filterNot { c -> c.tags.any { it in state.keptTags } }
                .map { c -> c to overlap(c.tags, targetTags) }
                .filter { it.second >= OVERLAP_THRESHOLD }
                .sortedByDescending { it.second }
                .toList()
        }

        val cap = (state.alive.size * MAX_RATIO).toInt().coerceAtLeast(0)
        val alsoRemoved = scored.take(cap).map { it.first }

        val nextAlive = rest.filterNot { c -> alsoRemoved.any { it.id == c.id } }
        if (nextAlive.isEmpty()) {
            return state.copy(message = "全部消えてしまうので、この消し方はやめておきました")
        }

        return state.copy(
            alive = nextAlive,
            removed = state.removed + target + alsoRemoved,
            last = Elimination(
                target = target,
                alsoRemoved = alsoRemoved,
                reasonTag = reasonTag(target, alsoRemoved, state.alive),
            ),
            message = null,
        )
    }

    /** 直前の消去を戻す。戻したタグは以後 keptTags として消去に使わない */
    fun undo(state: EliminateUiState): EliminateUiState {
        val last = state.last ?: return state
        val restored = listOf(last.target) + last.alsoRemoved
        val restoredIds = restored.map { it.id }.toSet()

        return state.copy(
            alive = state.alive + restored,
            removed = state.removed.filterNot { it.id in restoredIds },
            keptTags = state.keptTags + listOfNotNull(last.reasonTag),
            last = null,
            message = last.reasonTag?.let { "「${it.label}」では消さないようにします" },
        )
    }

    private fun overlap(tags: Set<Tag>, targetTags: Set<Tag>): Double =
        if (targetTags.isEmpty()) 0.0
        else tags.intersect(targetTags).size.toDouble() / targetTags.size

    /**
     * 理由として出すタグ。
     * 一緒に消えたものと共有していて、かつ全体で珍しいものほど「らしい」理由になる。
     */
    private fun reasonTag(
        target: Candidate,
        alsoRemoved: List<Candidate>,
        allAlive: List<Candidate>,
    ): Tag? {
        val shared = if (alsoRemoved.isEmpty()) {
            target.tags
        } else {
            target.tags.filter { t -> alsoRemoved.all { t in it.tags } }.toSet()
                .ifEmpty { target.tags.filter { t -> alsoRemoved.any { t in it.tags } }.toSet() }
        }
        if (shared.isEmpty()) return null

        val freq = allAlive.flatMap { it.tags }.groupingBy { it }.eachCount()
        return shared.minByOrNull { freq[it] ?: 0 }
    }
}
