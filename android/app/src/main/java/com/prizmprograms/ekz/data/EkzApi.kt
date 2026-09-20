package com.prizmprograms.ekz.data

import com.prizmprograms.ekz.model.Candidate
import com.prizmprograms.ekz.model.Tag
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

@Serializable
data class SearchResult(
    val baseMinutes: Int = 0,
    val distanceKm: Double = 0.0,
    val count: Int = 0,
    val candidates: List<Candidate> = emptyList(),
)

@Serializable
private data class SearchRequest(
    val origin: String,
    val destination: String,
    val queries: List<String>? = null,
)

@Serializable
private data class NextRequest(
    val candidates: List<Candidate>,
    val request: String = "",
    val badTags: List<String> = emptyList(),
)

@Serializable
private data class NextResponse(val id: String? = null, val confidence: Double? = null)

@Serializable
private data class TagRequest(val candidates: List<Candidate>)

@Serializable
private data class TagResult(val id: String, val tags: List<String> = emptyList())

@Serializable
private data class TagResponse(val results: List<TagResult> = emptyList())

/**
 * Cloudflare Workers のサーバを叩く。
 *
 * APIキーは全部サーバ側にあるので、アプリには何も持たせない。
 */
class EkzApi(
    private val baseUrl: String = BASE_URL,
    private val client: OkHttpClient = defaultClient(),
) {
    private val json = Json { ignoreUnknownKeys = true }
    private val mediaType = "application/json; charset=utf-8".toMediaType()

    /** ルート沿いの候補をまとめて取る。サーバ側で6時間キャッシュされる */
    suspend fun search(origin: String, destination: String): SearchResult =
        post("/search", json.encodeToString(SearchRequest(origin, destination)))
            .let { json.decodeFromString(it) }

    /**
     * 次に見せる1件を Jev に選ばせる。
     * 見終わったものと時間超過はアプリ側で落としてから渡す。
     */
    suspend fun next(
        candidates: List<Candidate>,
        request: String,
        badTags: Set<Tag>,
    ): String? {
        if (candidates.isEmpty()) return null
        val body = json.encodeToString(
            NextRequest(
                candidates = candidates.take(40),
                request = request,
                badTags = badTags.map { it.label },
            ),
        )
        return json.decodeFromString<NextResponse>(post("/next", body)).id
    }

    /** 表示する1件だけタグを取る。全件に付けると呼び出しが増えすぎる */
    suspend fun tag(candidate: Candidate): Set<Tag> {
        val body = json.encodeToString(TagRequest(listOf(candidate)))
        val res = json.decodeFromString<TagResponse>(post("/tag", body))
        return res.results.firstOrNull()?.tags.orEmpty()
            .mapNotNull { Tag.fromLabel(it) }
            .toSet()
    }

    /** 写真のURL。サーバが中継するのでAPIキーは出ない */
    fun photoUrl(photoName: String, maxWidthPx: Int = 1200): String =
        "$baseUrl/photo?name=$photoName&maxWidthPx=$maxWidthPx"

    private suspend fun post(path: String, body: String): String = withContext(Dispatchers.IO) {
        val req = Request.Builder()
            .url(baseUrl + path)
            .post(body.toRequestBody(mediaType))
            .build()

        client.newCall(req).execute().use { res ->
            val text = res.body?.string().orEmpty()
            if (!res.isSuccessful) error("サーバエラー ${res.code}: ${text.take(200)}")
            text
        }
    }

    companion object {
        const val BASE_URL = "https://ekz-server.prizmprograms.workers.dev"

        fun defaultClient(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .build()
    }
}
