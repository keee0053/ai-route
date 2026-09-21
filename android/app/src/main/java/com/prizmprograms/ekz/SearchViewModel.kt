package com.prizmprograms.ekz

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.prizmprograms.ekz.data.EkzApi
import com.prizmprograms.ekz.model.Extreme
import com.prizmprograms.ekz.model.Side
import com.prizmprograms.ekz.model.Genre
import com.prizmprograms.ekz.model.RouteInfo
import com.prizmprograms.ekz.model.SearchUiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class SearchViewModel(private val api: EkzApi = EkzApi()) : ViewModel() {

    private val _state = MutableStateFlow(SearchUiState())
    val state: StateFlow<SearchUiState> = _state.asStateFlow()

    /** ジャンルを選んで開始。genre が null なら「おまかせ」 */
    fun start(info: RouteInfo, genre: Genre?) {
        _state.value = SearchUiState(genre = genre, loading = true, loadingStep = "ルートを調べています")

        viewModelScope.launch {
            runCatching {
                val r = api.search(info.origin.toQuery(), info.destination.toQuery(), genre?.id)
                _state.value = _state.value.copy(loadingStep = "候補を集めています")
                r
            }.onSuccess { result ->
                _state.value = _state.value.copy(
                    all = result.candidates,
                    baseMinutes = result.baseMinutes,
                    loading = false,
                )
                advance(markSeen = false)
            }.onFailure { e ->
                _state.value = _state.value.copy(loading = false, error = e.message)
            }
        }
    }

    fun onRequestChange(text: String) {
        _state.value = _state.value.copy(request = text)
    }

    fun toggleTag(tag: String) {
        val s = _state.value
        _state.value = s.copy(feedback = s.feedback.toggleTag(tag), message = null)
    }

    /** 項目そのもの: 中立 -> 赤 -> 緑 -> 中立 */
    fun toggleExtreme(e: Extreme) {
        val s = _state.value
        _state.value = s.copy(feedback = s.feedback.toggleExtreme(e), message = null)
    }

    /** 赤のときだけ出る「短すぎる/長すぎる」。排他 */
    fun chooseSide(e: Extreme, side: Side) {
        val s = _state.value
        _state.value = s.copy(feedback = s.feedback.chooseSide(e, side), message = null)
    }

    fun next() = advance(markSeen = true)

    /** ひとつ前の店に戻る。もう一度見たくなることがある */
    fun back() {
        val s = _state.value
        val prev = s.history.lastOrNull() ?: return
        _state.value = s.copy(
            current = prev,
            history = s.history.dropLast(1),
            seen = s.seen - prev.id,
            reason = null,
            message = null,
        )
    }

    fun clearFeedback() {
        val s = _state.value
        _state.value = s.copy(feedback = com.prizmprograms.ekz.model.Feedback(), message = null)
        advance(markSeen = false)
    }

    /**
     * 次の1件を出す。
     * 絞り込みはサーバ側(Jev)に任せ、アプリでは見終わったものだけ除く。
     * 出しきったら黙って止めず、履歴をリセットして出し直す。
     */
    private fun advance(markSeen: Boolean) {
        viewModelScope.launch {
            var s = _state.value
            val seen = if (markSeen && s.current != null) s.seen + s.current!!.id else s.seen
            val history = if (markSeen && s.current != null) s.history + s.current!! else s.history
            s = s.copy(
                seen = seen,
                history = history,
                loading = true,
                loadingStep = "AIが選んでいます",
                message = null,
                error = null,
            )
            _state.value = s

            var note: String? = null
            if (s.pool().isEmpty()) {
                s = s.copy(seen = emptySet())
                note = "ひと通り見終わったので、最初から出し直します"
            }
            val pool = s.pool()
            if (pool.isEmpty()) {
                _state.value = s.copy(loading = false, current = null, message = "候補がありません")
                return@launch
            }

            runCatching {
                val fb = s.feedback
                val pick = api.next(pool, s.request, fb.badTags, fb.goodTags, fb.extremeNotes)
                val picked = pool.firstOrNull { it.id == pick.id } ?: pool.first()
                _state.value = _state.value.copy(loadingStep = "この場所を調べています")
                picked.copy(tags = runCatching { api.tag(picked) }.getOrDefault(emptyList())) to pick.reason
            }.onSuccess { (picked, reason) ->
                _state.value = s.copy(
                    current = picked,
                    reason = reason,
                    loading = false,
                    loadingStep = null,
                    message = note,
                )
            }.onFailure { e ->
                _state.value = s.copy(loading = false, loadingStep = null, error = e.message)
            }
        }
    }
}
