package com.prizmprograms.ekz

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.remember
import com.prizmprograms.ekz.data.LocationSource
import com.prizmprograms.ekz.model.Genre
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.prizmprograms.ekz.data.NavLauncher
import com.prizmprograms.ekz.data.RouteLinkResolver
import com.prizmprograms.ekz.model.RouteInfo
import com.prizmprograms.ekz.ui.PickScreen
import com.prizmprograms.ekz.ui.StartScreen

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
        Info("Googleマップで経路を検索して、共有からこのアプリを選んでください")
        return
    }

    val result by produceState<Result<RouteInfo>?>(initialValue = null, sharedText) {
        value = RouteLinkResolver().resolve(sharedText)
    }

    val current = result
    when {
        current == null -> Info("リンクを解析しています...", spinner = true)

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
private fun Search(info: RouteInfo, vm: SearchViewModel = viewModel()) {
    val context = LocalContext.current
    val state by vm.state.collectAsStateWithLifecycle()

    val summary = (info.origin.name ?: "現在地") + " → " + (info.destination.name ?: "目的地")

    // 位置情報は「あれば使う」。断られても出発地基準で動く
    var pendingGenre by remember { mutableStateOf<Genre?>(null) }
    val askLocation = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) {
        vm.start(info, pendingGenre, context)
    }

    if (!state.started) {
        StartScreen(
            summary = summary,
            destination = info.destination.name ?: "目的地",
            onStart = { genre ->
                pendingGenre = genre
                if (LocationSource.hasPermission(context)) {
                    vm.start(info, genre, context)
                } else {
                    askLocation.launch(Manifest.permission.ACCESS_FINE_LOCATION)
                }
            },
        )
        return
    }

    PickScreen(
        state = state,
        routeSummary = summary + (state.genre?.let { "  (" + it.label + ")" } ?: ""),
        onRequestChange = vm::onRequestChange,
        onToggleTag = vm::toggleTag,
        onToggleExtreme = vm::toggleExtreme,
        onChooseSide = vm::chooseSide,
        onDecide = { c ->
            NavLauncher.launch(context, NavLauncher.buildUrl(info, listOf(c.toPlace())))
        },
        onNext = vm::next,
        onBack = vm::back,
        onClear = vm::clearFeedback,
    )
}

@Composable
private fun Info(body: String, spinner: Boolean = false) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(text = "ekz", style = MaterialTheme.typography.headlineMedium)
        if (spinner) CircularProgressIndicator()
        Text(text = body)
    }
}
