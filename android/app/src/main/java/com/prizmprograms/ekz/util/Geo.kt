package com.prizmprograms.ekz.util

import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Google のエンコード済みポリラインを座標の配列に戻す。
 * サーバ側の polyline.js と同じ処理。**片方を直したら両方直すこと。**
 */
fun decodePolyline(encoded: String): List<Pair<Double, Double>> {
    val points = ArrayList<Pair<Double, Double>>(encoded.length / 4)
    var index = 0
    var lat = 0
    var lng = 0

    while (index < encoded.length) {
        var result = 0
        var shift = 0
        var b: Int
        do {
            b = encoded[index++].code - 63
            result = result or ((b and 0x1f) shl shift)
            shift += 5
        } while (b >= 0x20)
        lat += if (result and 1 != 0) (result shr 1).inv() else result shr 1

        result = 0
        shift = 0
        do {
            b = encoded[index++].code - 63
            result = result or ((b and 0x1f) shl shift)
            shift += 5
        } while (b >= 0x20)
        lng += if (result and 1 != 0) (result shr 1).inv() else result shr 1

        points.add(lat / 1e5 to lng / 1e5)
    }
    return points
}

/** 2点間の距離(km) */
fun distanceKm(aLat: Double, aLng: Double, bLat: Double, bLng: Double): Double {
    val r = 6371.0
    val toRad = { d: Double -> d * Math.PI / 180 }
    val dLat = toRad(bLat - aLat)
    val dLng = toRad(bLng - aLng)
    val s = sin(dLat / 2) * sin(dLat / 2) +
        cos(toRad(aLat)) * cos(toRad(bLat)) * sin(dLng / 2) * sin(dLng / 2)
    return 2 * r * asin(min(1.0, sqrt(s)))
}

/** ルート上で一番近い点。km はそこまでの距離、ratio はルート全体のどこか(0〜1) */
data class Nearest(val km: Double, val ratio: Double)

fun nearestOnRoute(points: List<Pair<Double, Double>>, lat: Double, lng: Double): Nearest {
    if (points.size < 2) return Nearest(0.0, 0.0)
    var min = Double.MAX_VALUE
    var at = 0
    val step = maxOf(1, points.size / 400)
    var i = 0
    while (i < points.size) {
        val d = distanceKm(points[i].first, points[i].second, lat, lng)
        if (d < min) {
            min = d
            at = i
        }
        i += step
    }
    return Nearest(min, at.toDouble() / (points.size - 1))
}

/** ルートから何km以内なら「このルートを移動中」とみなすか */
const val ON_ROUTE_KM = 1.0
