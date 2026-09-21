package com.prizmprograms.ekz.ui

/**
 * 分を読みやすく。60分を超えたら「2時間46分」の形にする。
 * 「166分」のままだと、ドライブの感覚と結びつかない。
 */
fun formatMinutes(minutes: Int): String {
    if (minutes < 60) return "${minutes}分"
    val h = minutes / 60
    val m = minutes % 60
    return if (m == 0) "${h}時間" else "${h}時間${m}分"
}
