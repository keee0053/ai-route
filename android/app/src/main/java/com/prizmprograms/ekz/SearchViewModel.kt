package com.prizmprograms.ekz

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.prizmprograms.ekz.data.EkzApi
import com.prizmprograms.ekz.model.RouteInfo
import com.prizmprograms.ekz.model.SearchUiState
import com.prizmprograms.ekz.model.Tag
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class SearchViewModel(private val api: EkzApi = EkzApi()) : ViewModel() {

    private val _state = MutableStateFlow(SearchUiState())
    val state: StateFlow<SearchUiState> = _state.asStateFlow()

    private var route: RouteInfo? = null

    /** 「消去法で探す」。ルート沿いの候補を取ってから最初の1件を出す */
    fun start(info: RouteInfo) {
        route = info
        _state.value = SearchUiState(loading = true)

        viewModelScope.launch {
            runCatching {
                api.search(info.origin.toQuery(), info.destination.toQuery())
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

    fun toggleTag(tag: Tag) {
        val s = _state.value
        _state.value = s.copy(
            badTags = if (tag in s.badTags) s.badTags - tag else s.badTags + tag,
            message = null,
        )
    }

    fun toggleDetour() {
        val s = _state.value
        val cur = s.current ?: return
        val on = s.maxDetour == null
        _state.value = s.copy(
            maxDetour = if (on) cur.detourMinutes else null,
            detourBadFor = if (on) cur.id else null,
            message = null,
        )
    }

    fun next() = advance(markSeen = true)

    fun relax() {
        _state.value = _state.value.copy(
            badTags = emptySet(),
            maxDetour = null,
            detourBadFor = null,
            message = null,
        )
        advance(markSeen = false)
    }

    /**
     * 次の1件を出す。
     *
     * 行き止まりを作らない: 出せるものが無くなったら黙って止まらず、
     * 時間条件 -> タグNG -> 見た履歴 の順に1段ずつゆるめて、何をゆるめたかを伝える。
     */
    private fun advance(markSeen: Boolean) {
        viewModelScope.launch {
            var s = _state.value
            val seen = if (markSeen && s.current != null) s.seen + s.current!!.id else s.seen
            s = s.copy(seen = seen, loading = true, message = null, error = null)
            _state.value = s

            var note: String? = null
            var pool = s.pool()

            if (pool.isEmpty() && s.maxDetour != null) {
                s = s.copy(maxDetour = null, detourBadFor = null)
                note = "これより短い寄り道が無かったので、時間の条件は外しました"
                pool = s.pool()
            }
            if (pool.isEmpty() && s.badTags.isNotEmpty()) {
                s = s.copy(badTags = emptySet())
                note = "条件に合うものが無くなったので、NG をいったん外しました"
                pool = s.pool()
            }
            if (pool.isEmpty()) {
                s = s.copy(seen = emptySet())
                note = "ひと通り見終わったので、最初から出し直します"
                pool = s.pool()
            }
            if (pool.isEmpty()) {
                _state.value = s.copy(loading = false, current = null, message = "候補がありません")
                return@launch
            }

            runCatching {
                val id = api.next(pool, s.request, s.badTags)
                val picked = pool.firstOrNull { it.id == id } ?: pool.first()
                val tags = runCatching { api.tag(picked) }.getOrDefault(emptySet())
                picked.copy(tags = tags)
            }.onSuccess { picked ->
                _state.value = s.copy(current = picked, loading = false, message = note)
            }.onFailure { e ->
                _state.value = s.copy(loading = false, error = e.message)
            }
        }
    }
}
