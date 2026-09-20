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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.unit.dp
import com.prizmprograms.ekz.data.RouteLinkResolver
import com.prizmprograms.ekz.model.RouteInfo

class MainActivity : ComponentActivity() {

    private var sharedText by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        sharedText = extractShared(intent)

        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    HomeScreen(sharedText)
                }
            }
        }
    }

    /** アプリが起動中に共有された場合 */
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
fun HomeScreen(sharedText: String?) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(text = "ekz", style = MaterialTheme.typography.headlineMedium)

        if (sharedText == null) {
            Text(text = "Googleマップで経路を検索して、共有からこのアプリを選んでください")
            return@Column
        }

        val result by produceState<Result<RouteInfo>?>(initialValue = null, sharedText) {
            value = RouteLinkResolver().resolve(sharedText)
        }

        val current = result
        when {
            current == null -> {
                CircularProgressIndicator()
                Text(text = "リンクを解析しています...")
            }

            current.isFailure -> {
                Text(
                    text = "読み取れませんでした",
                    style = MaterialTheme.typography.titleMedium,
                )
                Text(text = current.exceptionOrNull()?.message.orEmpty())
                HorizontalDivider()
                Text(text = sharedText, style = MaterialTheme.typography.bodySmall)
            }

            else -> RouteView(current.getOrThrow())
        }
    }
}

@Composable
private fun RouteView(info: RouteInfo) {
    Row2(label = "出発地", value = info.origin.toString())
    Row2(label = "目的地", value = info.destination.toString())
    Row2(
        label = "経由地",
        value = if (info.waypoints.isEmpty()) "なし"
        else info.waypoints.joinToString(" / ") { it.toString() },
    )
    Row2(label = "移動手段", value = info.travelMode)
    Row2(label = "ルート番号", value = info.routeIndex?.toString() ?: "既定")

    HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
    Text(text = "展開後のURL", style = MaterialTheme.typography.labelMedium)
    Text(text = info.expandedUrl, style = MaterialTheme.typography.bodySmall)
}

@Composable
private fun Row2(label: String, value: String) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(text = label, style = MaterialTheme.typography.labelMedium)
        Text(text = value, style = MaterialTheme.typography.bodyLarge)
    }
}
