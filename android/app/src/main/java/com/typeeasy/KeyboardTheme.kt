package com.typeeasy

import android.graphics.Color

/** Keyboard colors aligned with app light/dark palettes (src/theme/palettes.js). */
data class KeyboardTheme(
    val bg: Int,
    val keyLetter: Int,
    val keyAction: Int,
    val keyText: Int,
    val hintText: Int,
    val toolbarBg: Int,
    val toolbarText: Int,
    val resultBg: Int,
    val primary: Int,
    val suggestionBg: Int,
    val suggestionDivider: Int,
    val settingsBg: Int,
    val voiceBarBg: Int,
    val popupBg: Int,
    val popupStroke: Int,
    val pillBg: Int,
    val pillText: Int,
    val pillBorder: Int,
    val popupSelectedBg: Int,
) {
    companion object {
        val light = KeyboardTheme(
            bg = Color.parseColor("#D1D9E6"),
            keyLetter = Color.WHITE,
            keyAction = Color.parseColor("#B8C4D4"),
            keyText = Color.parseColor("#111827"),
            hintText = Color.parseColor("#6B7280"),
            toolbarBg = Color.parseColor("#1E88FF"),
            toolbarText = Color.WHITE,
            resultBg = Color.parseColor("#FFFFFF"),
            primary = Color.parseColor("#1E88FF"),
            suggestionBg = Color.parseColor("#D1D9E6"),
            suggestionDivider = Color.parseColor("#9CA3AF"),
            settingsBg = Color.parseColor("#F3F4F6"),
            voiceBarBg = Color.parseColor("#EEF2F7"),
            popupBg = Color.WHITE,
            popupStroke = Color.parseColor("#E5E7EB"),
            pillBg = Color.WHITE,
            pillText = Color.parseColor("#111827"),
            pillBorder = Color.parseColor("#DADDE8"),
            popupSelectedBg = Color.parseColor("#EEF1FF"),
        )

        val dark = KeyboardTheme(
            bg = Color.parseColor("#121820"),
            keyLetter = Color.parseColor("#1A222D"),
            keyAction = Color.parseColor("#2A3441"),
            keyText = Color.parseColor("#F1F5F9"),
            hintText = Color.parseColor("#64748B"),
            toolbarBg = Color.parseColor("#1A222D"),
            toolbarText = Color.parseColor("#F1F5F9"),
            resultBg = Color.parseColor("#1A222D"),
            primary = Color.parseColor("#1E88FF"),
            suggestionBg = Color.parseColor("#121820"),
            suggestionDivider = Color.parseColor("#2A3441"),
            settingsBg = Color.parseColor("#1A222D"),
            voiceBarBg = Color.parseColor("#1A222D"),
            popupBg = Color.parseColor("#1A222D"),
            popupStroke = Color.parseColor("#2A3441"),
            pillBg = Color.parseColor("#2A3441"),
            pillText = Color.parseColor("#F1F5F9"),
            pillBorder = Color.parseColor("#3D4A5C"),
            popupSelectedBg = Color.parseColor("#253A52"),
        )

        fun fromIsDark(isDark: Boolean) = if (isDark) dark else light
    }
}
