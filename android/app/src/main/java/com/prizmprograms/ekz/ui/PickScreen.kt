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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.prizmprograms.ekz.model.Candidate
import com.prizmprograms.ekz.model.SearchUiState
import com.prizmprograms.ekz.model.Tag

/** バッドを付けられる項目に出すマーク */
private const val BAD = "NG"

/**
 * 候補を1件だけ見せる画面。
 *
 * 気に入らない部分(タグ・追加でかかる時間)を押すと NG が付き、
 * 「別の場所」を押すとその条件を外した次の候補が出る。
 */
@Composable
fun PickScreen(
    state: SearchUiState,
    routeSummary: String,
    onRequestChange: (String) -> Unit,
    onToggleTag: (Tag) -> Unit,
    onToggleDetour: () -> Unit,
    onDecide: (Candidate) -> Unit,
    onNext: () -> Unit,
    onRelax: () -> Unit,
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
            placeholder = { Text(text = "例: 甘いものが食べたい / 歩きたい") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )

        val c = state.current
        if (c == null) {
            Text(
                text = state.message ?: "候補がありません",
                style = MaterialTheme.typography.titleMedium,
            )
            if (state.hasFeedback) {
                Button(onClick = onRelax, modifier = Modifier.fillMaxWidth()) {
                    Text(text = "条件をゆるめてもう一度探す")
                }
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
            text = "${c.category}  ${c.rating ?: ""}",
            style = MaterialTheme.typography.bodyMedium,
        )

        // タグ: 押すと NG
        FlowTags(
            tags = c.tags.toList(),
            badTags = state.badTags,
            onToggle = onToggleTag,
        )

        // 追加でかかる時間: 押すと NG
        Fact(
            label = "追加でかかる時間",
            value = "+" + c.detourMinutes + "分",
            bad = state.detourIsBad,
            note = state.detourNote,
            onClick = onToggleDetour,
        )

        Fact(label = "あと何分でつく", value = "${state.etaMinutes}分")
        Fact(label = "価格相場", value = c.priceRange ?: "不明")

        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Button(
                onClick = { onDecide(c) },
                modifier = Modifier.weight(1f),
            ) { Text(text = "ここにする") }

            OutlinedButton(
                onClick = onNext,
                modifier = Modifier.weight(1f),
            ) { Text(text = "別の場所") }
        }

        val avoiding = state.avoiding
        if (avoiding != null) {
            Text(
                text = avoiding,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
            )
            TextButton(onClick = onRelax, modifier = Modifier.fillMaxWidth()) {
                Text(text = "NG をすべて解除")
            }
        }
    }
}

@Composable
private fun Photo(c: Candidate) {
    // TODO: Places の写真が取れるようになったら photoUrl を表示する
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(16f / 9f)
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.secondaryContainer),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = c.category,
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.onSecondaryContainer,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun FlowTags(tags: List<Tag>, badTags: Set<Tag>, onToggle: (Tag) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        tags.chunked(3).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { t ->
                    val bad = t in badTags
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = if (bad) MaterialTheme.colorScheme.errorContainer
                        else MaterialTheme.colorScheme.surfaceVariant,
                        modifier = Modifier.clickable { onToggle(t) },
                    ) {
                        Text(
                            text = if (bad) "$BAD ${t.label}" else t.label,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun Fact(
    label: String,
    value: String,
    bad: Boolean = false,
    note: String? = null,
    onClick: (() -> Unit)? = null,
) {
    val base = Modifier.fillMaxWidth()
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = if (bad) MaterialTheme.colorScheme.errorContainer
        else MaterialTheme.colorScheme.surface,
        modifier = if (onClick != null) base.clickable { onClick() } else base,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp, horizontal = 4.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column {
                Text(text = label, style = MaterialTheme.typography.bodyMedium)
                if (note != null) {
                    Text(
                        text = note,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }
            Text(
                text = if (bad) "$BAD $value" else value,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}
