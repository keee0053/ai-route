package com.prizmprograms.ekz

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
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
import androidx.compose.ui.unit.dp
import com.prizmprograms.ekz.data.DummyCandidates
import com.prizmprograms.ekz.data.NavLauncher
import com.prizmprograms.ekz.data.RouteLinkResolver
import com.prizmprograms.ekz.logic.Eliminator
import com.prizmprograms.ekz.model.EliminateUiState
import com.prizmprograms.ekz.model.RouteInfo
import com.prizmprograms.ekz.ui.EliminateScreen

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
        Centered(text = "Googleマップで経路を検索して、共有からこのアプリを選んでください")
        return
    }

    val result by produceState<Result<RouteInfo>?>(initialValue = null, sharedText) {
        value = RouteLinkResolver().resolve(sharedText)
    }

    val current = result
    when {
        current == null -> Centered(text = "リンクを解析しています...", spinner = true)

        current.isFailure -> Column(modifier = Modifier.fillMaxSize().padding(20.dp)) {
            Text(text = "読み取れませんでした", style = MaterialTheme.typography.titleMedium)
            Text(text = current.exceptionOrNull()?.message.orEmpty())
            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
            Text(text = sharedText, style = MaterialTheme.typography.bodySmall)
        }

        else -> Eliminate(current.getOrThrow())
    }
}

@Composable
private fun Eliminate(info: RouteInfo) {
    val context = LocalContext.current

    // TODO: ダミー。本番は Routes API でポリラインを引き、Places で集めて LLM でタグ付けする
    var state by remember {
        mutableStateOf(EliminateUiState(alive = DummyCandidates.list()))
    }

    val summary = "${info.origin.name ?: "現在地"} → ${info.destination.name ?: "目的地"}" +
        "  (候補はダミー)"

    EliminateScreen(
        state = state,
        routeSummary = summary,
        onEliminate = { state = Eliminator.eliminate(state, it) },
        onUndo = { state = Eliminator.undo(state) },
        onDecide = { c ->
            NavLauncher.launch(context, NavLauncher.buildUrl(info, listOf(c.toPlace())))
        },
        onReset = { state = EliminateUiState(alive = DummyCandidates.list()) },
    )
}

@Composable
private fun Centered(text: String, spinner: Boolean = false) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(text = "ekz", style = MaterialTheme.typography.headlineMedium)
        if (spinner) CircularProgressIndicator()
        Text(text = text)
    }
}
