package com.prizmprograms.ekz.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.prizmprograms.ekz.model.Genre

/**
 * ジャンルを選ぶ画面。
 *
 * ボタンの文言は「カテゴリ」ではなく「気分」にしてある。
 * 「飲食店 / 公園 / 観光地」と並べると絞り込み検索に見えてしまうため。
 * 何も選ばずに「おまかせで探す」から始められるのがこのアプリの建て付け。
 */
@Composable
fun StartScreen(
    summary: String,
    destination: String,
    onStart: (Genre?) -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(text = "ekz", style = MaterialTheme.typography.headlineMedium)
        Text(text = summary, style = MaterialTheme.typography.labelMedium)
        Text(
            text = "$destination までの道中で寄れる場所を探します",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(bottom = 8.dp),
        )

        Genre.entries.chunked(2).forEach { row ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                row.forEach { g ->
                    FilledTonalButton(
                        onClick = { onStart(g) },
                        modifier = Modifier.weight(1f).height(56.dp),
                    ) { Text(text = g.label) }
                }
                if (row.size == 1) {
                    Column(modifier = Modifier.weight(1f)) {}
                }
            }
        }

        Button(
            onClick = { onStart(null) },
            modifier = Modifier.fillMaxWidth().height(56.dp).padding(top = 8.dp),
        ) { Text(text = "おまかせで探す") }
    }
}
