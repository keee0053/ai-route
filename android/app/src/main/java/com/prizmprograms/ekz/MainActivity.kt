package com.prizmprograms.ekz

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.prizmprograms.ekz.data.DummyCandidates
import com.prizmprograms.ekz.data.NavLauncher
import com.prizmprograms.ekz.data.RouteLinkResolver
import com.prizmprograms.ekz.logic.Picker
import com.prizmprograms.ekz.model.RouteInfo
import com.prizmprograms.ekz.model.SearchUiState
import com.prizmprograms.ekz.ui.PickScreen

class MainActivity : ComponentActivity() {

    private var sharedText by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        sharedText = extractShared(intent)

        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    App(sharedText)
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        sharedText = extractShared(intent)
    }

    private fun extractShared(intent: Intent?): String? =
        if (intent?.action == Intent.ACTION_SEND) {
            intent.getStringExtra(Intent.EXTRA_TEXT)
        } else {
            null
        }
}

@Composable
private fun App(sharedText: String?) {
    if (sharedText == null) {
        Info(title = "ekz", body = "Googleマップで経路を検索して、共有からこのアプリを選んでください")
        return
    }

    val result by produceState<Result<RouteInfo>?>(initialValue = null, sharedText) {
        value = RouteLinkResolver().resolve(sharedText)
    }

    val current = result
    when {
        current == null -> Info(title = "ekz", body = "リンクを解析しています...", spinner = true)

        current.isFailure -> Column(modifier = Modifier.fillMaxSize().padding(20.dp)) {
            Text(text = "読み取れませんでした", style = MaterialTheme.typography.titleMedium)
            Text(text = current.exceptionOrNull()?.message.orEmpty())
            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
            Text(text = sharedText, style = MaterialTheme.typography.bodySmall)
        }

        else -> Search(current.getOrThrow())
    }
}

@Composable
private fun Search(info: RouteInfo) {
    val context = LocalContext.current

    // TODO: ダミー。本番は Routes API でポリラインを引き、Places で集めて LLM でタグ付けする
    var state by remember { mutableStateOf(SearchUiState(all = DummyCandidates.list())) }

    val summary = "${info.origin.name ?: "現在地"} → ${info.destination.name ?: "目的地"}" +
        "  (候補はダミー)"

    if (!state.started) {
        StartScreen(
            summary = summary,
            destination = info.destination.name ?: "目的地",
            onStart = { state = Picker.start(state) },
        )
        return
    }

    PickScreen(
        state = state,
        routeSummary = summary,
        onRequestChange = { state = state.copy(request = it) },
        onToggleTag = { state = Picker.toggleTag(state, it) },
        onToggleDetour = { state = Picker.toggleDetour(state) },
        onDecide = { c ->
            NavLauncher.launch(context, NavLauncher.buildUrl(info, listOf(c.toPlace())))
        },
        onNext = { state = Picker.next(state) },
        onRelax = { state = Picker.relax(state) },
    )
}

@Composable
private fun StartScreen(summary: String, destination: String, onStart: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(text = "ekz", style = MaterialTheme.typography.headlineMedium)
        Text(text = summary, style = MaterialTheme.typography.labelMedium)
        Text(
            text = "$destination までの道中で寄れる場所を探します",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
        )
        Button(onClick = onStart, modifier = Modifier.fillMaxWidth()) {
            Text(text = "消去法で探す")
        }
    }
}

@Composable
private fun Info(title: String, body: String, spinner: Boolean = false) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(text = title, style = MaterialTheme.typography.headlineMedium)
        if (spinner) CircularProgressIndicator()
        Text(text = body)
    }
}
