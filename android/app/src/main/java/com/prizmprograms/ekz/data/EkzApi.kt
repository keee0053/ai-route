package com.prizmprograms.ekz.data

import com.prizmprograms.ekz.model.Candidate
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
    val genre: String? = null,
)

@Serializable
private data class NextRequest(
    val candidates: List<Candidate>,
    val request: String = "",
    val badTags: List<String> = emptyList(),
    val goodTags: List<String> = emptyList(),
    val notes: List<String> = emptyList(),
)

@Serializable
private data class NextResponse(
    val id: String? = null,
    val confidence: Double? = null,
    val reason: String? = null,
)

/** 次の1件と、なぜそれを選んだかの一言 */
data class Pick(val id: String?, val reason: String?)

@Serializable
private data class TagRequest(val candidate: Candidate)

@Serializable
private data class TagResponse(val tags: List<String> = emptyList())

/**
 * Cloudflare Workers のサーバを叩く。
 * APIキーは全部サーバ側にあるので、アプリには何も持たせない。
 */
class EkzApi(
    private val baseUrl: String = BASE_URL,
    private val client: OkHttpClient = defaultClient(),
) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val mediaType = "application/json; charset=utf-8".toMediaType()

    /** ルート沿いの候補をまとめて取る。サーバ側で6時間キャッシュされる */
    suspend fun search(origin: String, destination: String, genre: String?): SearchResult =
        json.decodeFromString(
            post("/search", json.encodeToString(SearchRequest(origin, destination, genre))),
        )

    /** 次に見せる1件を Jev に選ばせる */
    suspend fun next(
        candidates: List<Candidate>,
        request: String,
        badTags: List<String>,
        goodTags: List<String>,
        notes: List<String>,
    ): Pick {
        if (candidates.isEmpty()) return Pick(null, null)
        val body = json.encodeToString(
            NextRequest(candidates.take(40), request, badTags, goodTags, notes),
        )
        val res = json.decodeFromString<NextResponse>(post("/next", body))
        return Pick(res.id, res.reason)
    }

    /** その場所のタグを AI に都度作らせる。表示する1件だけ */
    suspend fun tag(candidate: Candidate): List<String> =
        json.decodeFromString<TagResponse>(
            post("/tag", json.encodeToString(TagRequest(candidate))),
        ).tags

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
