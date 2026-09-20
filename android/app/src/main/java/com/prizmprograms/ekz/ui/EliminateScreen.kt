package com.prizmprograms.ekz.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.prizmprograms.ekz.model.Candidate
import com.prizmprograms.ekz.model.EliminateUiState

/**
 * 消去型の画面。
 *
 * 30件出して、嫌なものを消していく。1件消すと似たものが連鎖で消える。
 * 最後に残った1件を経由地にする。
 *
 * 地図はまだ出していない (maps-compose は APIキーが無いとタイルが出ないため)。
 * キーが用意できたらカードの上に地図を被せる。
 */
@Composable
fun EliminateScreen(
    state: EliminateUiState,
    routeSummary: String,
    onEliminate: (Candidate) -> Unit,
    onUndo: () -> Unit,
    onDecide: (Candidate) -> Unit,
    onReset: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxSize().padding(horizontal = 16.dp)) {

        Text(
            text = routeSummary,
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(top = 12.dp),
        )

        val decided = state.decided
        if (decided != null) {
            DecidedView(decided, onDecide, onReset)
            return@Column
        }

        Row(
            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "残り ${state.alive.size} 件",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
            if (state.canUndo) {
                TextButton(onClick = onUndo) { Text(text = "元に戻す") }
            }
        }

        val note = state.message ?: state.last?.reasonText
        if (note != null) {
            Text(
                text = note,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(bottom = 8.dp),
            )
        }

        HorizontalDivider()

        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.padding(vertical = 8.dp),
        ) {
            items(items = state.alive, key = { it.id }) { c ->
                CandidateCard(c) { onEliminate(c) }
            }
        }
    }
}

@Composable
private fun CandidateCard(c: Candidate, onEliminate: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable { onEliminate() },
        colors = CardDefaults.cardColors(),
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = c.name,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "+${c.detourMinutes}分",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
            Text(
                text = "${c.category}  ${c.rating ?: ""}",
                style = MaterialTheme.typography.bodySmall,
            )
            Text(
                text = c.tags.joinToString("・") { it.label },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.outline,
            )
        }
    }
}

@Composable
private fun DecidedView(
    c: Candidate,
    onDecide: (Candidate) -> Unit,
    onReset: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(top = 24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(text = "ここに決まりました", style = MaterialTheme.typography.titleMedium)
        Text(
            text = c.name,
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
        )
        Text(text = "${c.category}  寄り道 +${c.detourMinutes}分")
        Text(
            text = c.tags.joinToString("・") { it.label },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.outline,
        )

        Button(onClick = { onDecide(c) }, modifier = Modifier.fillMaxWidth()) {
            Text(text = "ここを経由地にしてナビ開始")
        }
        TextButton(onClick = onReset, modifier = Modifier.fillMaxWidth()) {
            Text(text = "やり直す")
        }
    }
}
