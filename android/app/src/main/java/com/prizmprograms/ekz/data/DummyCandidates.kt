package com.prizmprograms.ekz.data

import com.prizmprograms.ekz.model.Candidate
import com.prizmprograms.ekz.model.Tag
import com.prizmprograms.ekz.model.Tag.CHEAP
import com.prizmprograms.ekz.model.Tag.EXPENSIVE
import com.prizmprograms.ekz.model.Tag.INDOOR
import com.prizmprograms.ekz.model.Tag.LIVELY
import com.prizmprograms.ekz.model.Tag.LONG_STAY
import com.prizmprograms.ekz.model.Tag.MEAL
import com.prizmprograms.ekz.model.Tag.NO_WAIT
import com.prizmprograms.ekz.model.Tag.OUTDOOR
import com.prizmprograms.ekz.model.Tag.PHOTOGENIC
import com.prizmprograms.ekz.model.Tag.QUEUE
import com.prizmprograms.ekz.model.Tag.QUIET
import com.prizmprograms.ekz.model.Tag.SHORT
import com.prizmprograms.ekz.model.Tag.SNACK
import com.prizmprograms.ekz.model.Tag.SWEETS
import com.prizmprograms.ekz.model.Tag.VIEW

/**
 * ダミー候補。京都 -> 舞子 のルート沿いを想定した仮データ。
 *
 * 本番では Places API で集めて LLM にタグを付けさせる。
 * ここでは「連鎖消去が面白いか」を先に確かめるために手書きしている。
 * 座標もおおよそで、正確さは問わない。
 */
object DummyCandidates {

    fun list(): List<Candidate> = raw.mapIndexed { i, c -> c.copy(id = "dummy-$i") }

    private fun c(
        name: String,
        category: String,
        detour: Int,
        rating: Double,
        price: String,
        vararg tags: Tag,
    ) = Candidate(
        id = "",
        name = name,
        category = category,
        rating = rating,
        reviewCount = 100,
        detourMinutes = detour,
        priceRange = price,
        tags = tags.toSet(),
    )

    private val raw = listOf(
        c("梅小路公園", "公園", 5, 4.2, "無料", OUTDOOR, QUIET, LONG_STAY, CHEAP),
        c("京都鉄道博物館", "博物館", 12, 4.5, "1,200円", INDOOR, LONG_STAY, EXPENSIVE, PHOTOGENIC),
        c("東寺", "寺", 8, 4.4, "500円", OUTDOOR, QUIET, PHOTOGENIC, SHORT),
        c("伏見稲荷大社", "神社", 18, 4.6, "無料", OUTDOOR, LIVELY, PHOTOGENIC, QUEUE, LONG_STAY),
        c("中村軒", "甘味処", 14, 4.3, "800〜1,500円", SWEETS, QUEUE, INDOOR, LONG_STAY),
        c("桂川パーキング", "SA", 3, 3.6, "〜1,000円", NO_WAIT, SHORT, SNACK, CHEAP),
        c("大山崎山荘美術館", "美術館", 20, 4.4, "1,100円", INDOOR, QUIET, VIEW, EXPENSIVE),
        c("サントリー山崎蒸溜所", "見学", 22, 4.5, "1,000〜3,000円", INDOOR, QUEUE, PHOTOGENIC, LONG_STAY),
        c("高槻城公園", "公園", 10, 3.9, "無料", OUTDOOR, QUIET, SHORT, CHEAP),
        c("吹田SA", "SA", 4, 3.8, "〜1,000円", NO_WAIT, SNACK, SHORT, CHEAP),
        c("万博記念公園", "公園", 24, 4.5, "260円", OUTDOOR, LIVELY, LONG_STAY, PHOTOGENIC),
        c("ニフレル", "水族館", 25, 4.3, "2,200円", INDOOR, LIVELY, PHOTOGENIC, EXPENSIVE),
        c("新梅田食道街", "飲食街", 15, 4.0, "1,000〜2,000円", MEAL, LIVELY, CHEAP, NO_WAIT),
        c("グランフロント大阪", "商業施設", 17, 4.2, "2,000〜5,000円", INDOOR, LIVELY, LONG_STAY, EXPENSIVE),
        c("中之島公園", "公園", 13, 4.1, "無料", OUTDOOR, QUIET, VIEW, CHEAP),
        c("尼崎城", "城", 9, 3.9, "500円", INDOOR, SHORT, PHOTOGENIC, CHEAP),
        c("甲子園歴史館", "博物館", 11, 4.4, "900円", INDOOR, LONG_STAY, EXPENSIVE),
        c("西宮ガーデンズ", "商業施設", 8, 4.2, "1,000〜3,000円", INDOOR, LIVELY, LONG_STAY, MEAL),
        c("夙川公園", "公園", 6, 4.3, "無料", OUTDOOR, QUIET, SHORT, CHEAP),
        c("芦屋浜", "海岸", 7, 4.0, "無料", OUTDOOR, QUIET, VIEW, CHEAP),
        c("六甲アイランド", "街", 10, 3.8, "無料", OUTDOOR, QUIET, VIEW, SHORT),
        c("北野異人館街", "観光", 16, 4.2, "700〜1,500円", OUTDOOR, PHOTOGENIC, LONG_STAY, EXPENSIVE),
        c("南京町", "中華街", 14, 4.1, "500〜1,500円", MEAL, LIVELY, QUEUE, SNACK),
        c("神戸ハーバーランド", "商業施設", 12, 4.4, "1,000〜3,000円", OUTDOOR, LIVELY, VIEW, PHOTOGENIC),
        c("メリケンパーク", "公園", 13, 4.5, "無料", OUTDOOR, VIEW, PHOTOGENIC, SHORT),
        c("兵庫県立美術館", "美術館", 11, 4.3, "1,300円", INDOOR, QUIET, LONG_STAY, EXPENSIVE),
        c("須磨海浜公園", "公園", 6, 4.2, "無料", OUTDOOR, VIEW, SHORT, CHEAP),
        c("須磨浦山上遊園", "遊園地", 9, 4.0, "1,000円", OUTDOOR, VIEW, PHOTOGENIC, LONG_STAY),
        c("垂水漁港", "漁港", 5, 4.1, "500〜1,500円", MEAL, NO_WAIT, CHEAP, OUTDOOR),
        c("アジュール舞子", "海岸", 3, 4.4, "無料", OUTDOOR, VIEW, PHOTOGENIC, SHORT),
    )
}
