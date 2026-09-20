package com.prizmprograms.ekz.data

import com.prizmprograms.ekz.model.RouteInfo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

/**
 * 共有された短縮URL (maps.app.goo.gl/...) を展開して RouteInfo にする。
 *
 * Web では CORS で出来なかったが、Android なら OkHttp がリダイレクトを追えるので
 * サーバを経由せずクライアントだけで完結する。
 */
class RouteLinkResolver(
    private val client: OkHttpClient = defaultClient(),
) {

    suspend fun resolve(sharedText: String): Result<RouteInfo> = withContext(Dispatchers.IO) {
        runCatching {
            val url = RouteLinkParser.extractUrl(sharedText)
                ?: error("共有された内容にURLが見つかりませんでした")

            val expanded = expand(url)

            RouteLinkParser.parse(expanded)
                ?: error("経路リンクではないようです (場所の共有リンクかもしれません)")
        }
    }

    /** リダイレクトを追って、最終的なURLを返す */
    private fun expand(url: String): String {
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", UA)
            .build()

        client.newCall(request).execute().use { response ->
            return response.request.url.toString()
        }
    }

    companion object {
        private const val UA =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
                "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"

        fun defaultClient(): OkHttpClient = OkHttpClient.Builder()
            .followRedirects(true)
            .followSslRedirects(true)
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .build()
    }
}
