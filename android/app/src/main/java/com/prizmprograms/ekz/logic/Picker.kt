package com.prizmprograms.ekz.logic

import com.prizmprograms.ekz.model.Candidate
import com.prizmprograms.ekz.model.SearchUiState
import com.prizmprograms.ekz.model.Tag

/**
 * 次に見せる1件を選ぶ。
 *
 * バッドを付けた属性を除外条件にして、残りから一番良さそうなものを出す。
 * 判定は全部ローカルなので一瞬で終わる (LLM はタグ付けの1回だけ)。
 *
 * 重要: 行き止まりを作らない。
 * 条件に合うものが無くなったら、勝手に黙って諦めるのではなく
 * 条件を1段ゆるめて出し直し、何をゆるめたかをユーザーに伝える。
 * (デモ中に「候補がありません」で止まるのが一番まずい)
 */
object Picker {

    fun start(state: SearchUiState): SearchUiState = advance(state, markSeen = false)

    /** 「別の場所」。今の1件を見た扱いにして次を出す */
    fun next(state: SearchUiState): SearchUiState = advance(state, markSeen = true)

    fun toggleTag(state: SearchUiState, tag: Tag): SearchUiState =
        state.copy(
            badTags = if (tag in state.badTags) state.badTags - tag else state.badTags + tag,
            message = null,
        )

    /** 「追加でかかる時間」にバッド。今の候補より短いものを探すようになる */
    fun toggleDetour(state: SearchUiState): SearchUiState {
        val cur = state.current ?: return state
        val on = state.maxDetour == null
        return state.copy(
            maxDetour = if (on) cur.detourMinutes else null,
            detourBadFor = if (on) cur.id else null,
            message = null,
        )
    }

    /** 明示的に全部のNGを外す */
    fun relax(state: SearchUiState): SearchUiState =
        advance(
            state.copy(badTags = emptySet(), maxDetour = null, detourBadFor = null, message = null),
            markSeen = false,
        )

    private fun advance(state: SearchUiState, markSeen: Boolean): SearchUiState {
        val seen = if (markSeen && state.current != null) {
            state.seen + state.current.id
        } else {
            state.seen
        }

        // 1. 全部の条件で探す
        pick(state.all, seen, state.badTags, state.maxDetour, state.request)?.let {
            return state.copy(seen = seen, current = it, message = null)
        }

        // 2. 時間の条件だけ外す
        if (state.maxDetour != null) {
            pick(state.all, seen, state.badTags, null, state.request)?.let {
                return state.copy(
                    seen = seen,
                    current = it,
                    maxDetour = null,
                    detourBadFor = null,
                    message = "これより短い寄り道が無かったので、時間の条件は外しました",
                )
            }
        }

        // 3. タグのNGも外す
        if (state.badTags.isNotEmpty()) {
            pick(state.all, seen, emptySet(), null, state.request)?.let {
                return state.copy(
                    seen = seen,
                    current = it,
                    badTags = emptySet(),
                    maxDetour = null,
                    detourBadFor = null,
                    message = "条件に合うものが無くなったので、NG をいったん外しました",
                )
            }
        }

        // 4. 見たものも含めて最初から
        pick(state.all, emptySet(), emptySet(), null, state.request)?.let {
            return state.copy(
                seen = emptySet(),
                current = it,
                badTags = emptySet(),
                maxDetour = null,
                message = "ひと通り見終わったので、最初から出し直します",
            )
        }

        return state.copy(seen = seen, current = null, message = "候補がありません")
    }

    private fun pick(
        all: List<Candidate>,
        seen: Set<String>,
        badTags: Set<Tag>,
        maxDetour: Int?,
        request: String,
    ): Candidate? = all
        .asSequence()
        .filterNot { it.id in seen }
        .filterNot { c -> c.tags.any { it in badTags } }
        .filter { c -> maxDetour == null || c.detourMinutes < maxDetour }
        .maxWithOrNull(
            // 要望への一致 > 評価 > 寄り道が短い
            compareBy<Candidate> { requestScore(it, request) }
                .thenBy { it.rating ?: 0.0 }
                .thenBy { -it.detourMinutes },
        )

    /**
     * 追加要望とのゆるい一致。
     * TODO: 本番はここを LLM に投げる。今は名前・カテゴリ・タグへの単純な部分一致。
     */
    private fun requestScore(c: Candidate, request: String): Int {
        if (request.isBlank()) return 0
        val haystack = buildString {
            append(c.name)
            append(c.category)
            c.tags.forEach { append(it.label) }
        }
        return request.split(" ", "、", "・")
            .map { it.trim() }
            .filter { it.length >= 2 }
            .count { haystack.contains(it) }
    }
}
