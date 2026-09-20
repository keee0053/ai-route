package com.prizmprograms.ekz.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.prizmprograms.ekz.data.EkzApi
import com.prizmprograms.ekz.model.Candidate
import com.prizmprograms.ekz.model.Extreme
import com.prizmprograms.ekz.model.SearchUiState
import com.prizmprograms.ekz.model.Vote

/** いい感じ(緑)。Material のテーマに緑が無いので直接指定する */
private val GoodBg = Color(0xFFCDEFCB)
private val GoodFg = Color(0xFF1B5E20)

/**
 * 候補を1件だけ見せる画面。
 *
 * タグも数値の項目も、タップするたびに 中立 → 嫌(赤) → いい感じ(緑) → 中立 と回る。
 * 「別の場所」を押すと、その反応をサーバに渡して次の候補が出る。
 */
@Composable
fun PickScreen(
    state: SearchUiState,
    routeSummary: String,
    onRequestChange: (String) -> Unit,
    onToggleTag: (String) -> Unit,
    onToggleExpanded: (Extreme) -> Unit,
    onToggleExtreme: (Extreme, Boolean) -> Unit,
    onDecide: (Candidate) -> Unit,
    onNext: () -> Unit,
    onClear: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(text = routeSummary, style = MaterialTheme.typography.labelMedium)

        OutlinedTextField(
            value = state.request,
            onValueChange = onRequestChange,
            label = { Text(text = "AIへの追加要望") },
            placeholder = { Text(text = "例: 歩きたい / 静かなところ") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )

        if (state.loading) {
            CircularProgressIndicator()
            Text(text = "探しています...")
        }

        if (state.error != null) {
            Text(text = "サーバに繋がりませんでした", style = MaterialTheme.typography.titleMedium)
            Text(text = state.error, style = MaterialTheme.typography.bodySmall)
        }

        val c = state.current
        if (c == null) {
            if (!state.loading && state.error == null) {
                Text(
                    text = state.message ?: "候補がありません",
                    style = MaterialTheme.typography.titleMedium,
                )
            }
            return@Column
        }

        Photo(c)

        Text(
            text = c.name,
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = c.category + "  " + (c.rating?.toString() ?: ""),
            style = MaterialTheme.typography.bodyMedium,
        )

        Tags(c.tags, state, onToggleTag)

        Fact("追加でかかる時間", "+" + c.detourMinutes + "分", Extreme.DETOUR, state, onToggleExpanded, onToggleExtreme)
        Fact("あと何分でつく", state.etaMinutes.toString() + "分", Extreme.ETA, state, onToggleExpanded, onToggleExtreme)
        Fact("価格相場", c.priceRange ?: "不明", Extreme.PRICE, state, onToggleExpanded, onToggleExtreme)

        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Button(onClick = { onDecide(c) }, modifier = Modifier.weight(1f)) {
                Text(text = "ここにする")
            }
            OutlinedButton(onClick = onNext, modifier = Modifier.weight(1f)) {
                Text(text = "別の場所")
            }
        }

        val summary = state.summaryOfFeedback
        if (summary != null) {
            Text(
                text = summary,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
            )
            TextButton(onClick = onClear, modifier = Modifier.fillMaxWidth()) {
                Text(text = "印をすべて解除")
            }
        }
    }
}

@Composable
private fun Tags(tags: List<String>, state: SearchUiState, onToggle: (String) -> Unit) {
    if (tags.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        tags.chunked(3).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { t ->
                    Chip(text = t, vote = state.feedback.voteOf(t)) { onToggle(t) }
                }
            }
        }
    }
}

@Composable
private fun Chip(text: String, vote: Vote, onClick: () -> Unit) {
    val bg = when (vote) {
        Vote.NEUTRAL -> MaterialTheme.colorScheme.surfaceVariant
        Vote.BAD -> MaterialTheme.colorScheme.errorContainer
        Vote.GOOD -> GoodBg
    }
    val fg = when (vote) {
        Vote.NEUTRAL -> MaterialTheme.colorScheme.onSurfaceVariant
        Vote.BAD -> MaterialTheme.colorScheme.onErrorContainer
        Vote.GOOD -> GoodFg
    }
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = bg,
        modifier = Modifier.clickable { onClick() },
    ) {
        Text(
            text = text,
            color = fg,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
        )
    }
}

@Composable
private fun Fact(
    label: String,
    value: String,
    extreme: Extreme,
    state: SearchUiState,
    onToggleExpanded: (Extreme) -> Unit,
    onToggleExtreme: (Extreme, Boolean) -> Unit,
) {
    val low = state.feedback.voteOf(extreme, true)
    val high = state.feedback.voteOf(extreme, false)
    val marked = low != Vote.NEUTRAL || high != Vote.NEUTRAL

    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { onToggleExpanded(extreme) }
                .padding(vertical = 8.dp, horizontal = 4.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(text = label, style = MaterialTheme.typography.bodyMedium)
            Text(
                text = value,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = if (marked) MaterialTheme.colorScheme.primary
                else MaterialTheme.colorScheme.onSurface,
            )
        }

        if (extreme in state.feedback.expanded) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Chip(text = extreme.shortLabel, vote = low) { onToggleExtreme(extreme, true) }
                Chip(text = extreme.longLabel, vote = high) { onToggleExtreme(extreme, false) }
            }
        }
    }
}

@Composable
private fun Photo(c: Candidate) {
    val url = c.photoName?.let { EkzApi().photoUrl(it) }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(16f / 9f)
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.secondaryContainer),
        contentAlignment = Alignment.Center,
    ) {
        if (url != null) {
            AsyncImage(
                model = url,
                contentDescription = c.name,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Text(
                text = c.category,
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSecondaryContainer,
                textAlign = TextAlign.Center,
            )
        }
    }
}
