package com.typeeasy

import android.graphics.Color

/**
 * Keyboard colors — Aura Lumina palette from keyboard.html.
 * Dark matches the mock; light is a soft counterpart with the same accents.
 */
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
    val accentCyan: Int,
    val enterStart: Int,
    val enterEnd: Int,
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
    val toolPillBg: Int,
    val toolPillBorder: Int,
    val predictionChipBg: Int,
    val predictionChipBorder: Int,
    val ribbonBorder: Int,
) {
    companion object {
        /** Aura Lumina dark (keyboard.html) */
        val dark = KeyboardTheme(
            bg = Color.parseColor("#101726"),
            keyLetter = Color.parseColor("#1E293B"),
            keyAction = Color.parseColor("#253248"),
            keyText = Color.parseColor("#F1F5F9"),
            hintText = Color.parseColor("#94A3B8"),
            toolbarBg = Color.parseColor("#101726"),
            toolbarText = Color.parseColor("#F1F5F9"),
            resultBg = Color.parseColor("#151E2E"),
            primary = Color.parseColor("#1A73E8"),
            accentCyan = Color.parseColor("#38BDF8"),
            enterStart = Color.parseColor("#1A73E8"),
            enterEnd = Color.parseColor("#1E6DEB"),
            suggestionBg = Color.parseColor("#101726"),
            suggestionDivider = Color.parseColor("#1E293B"),
            settingsBg = Color.parseColor("#151E2E"),
            voiceBarBg = Color.parseColor("#101726"),
            popupBg = Color.parseColor("#1E293B"),
            popupStroke = Color.parseColor("#38BDF8"),
            pillBg = Color.parseColor("#1E293B"),
            pillText = Color.parseColor("#F1F5F9"),
            pillBorder = Color.parseColor("#334155"),
            popupSelectedBg = Color.parseColor("#2A3B54"),
            toolPillBg = Color.parseColor("#1E293B"),
            toolPillBorder = Color.parseColor("#334155"),
            predictionChipBg = Color.parseColor("#1E293B"),
            predictionChipBorder = Color.parseColor("#334155"),
            ribbonBorder = Color.TRANSPARENT,
        )

        val light = KeyboardTheme(
            bg = Color.parseColor("#EEF4FB"),
            keyLetter = Color.WHITE,
            keyAction = Color.parseColor("#DFE8F6"),
            keyText = Color.parseColor("#1E293B"),
            hintText = Color.parseColor("#94A3B8"),
            toolbarBg = Color.parseColor("#EEF4FB"),
            toolbarText = Color.parseColor("#1E293B"),
            resultBg = Color.WHITE,
            primary = Color.parseColor("#1A73E8"),
            accentCyan = Color.parseColor("#1A73E8"),
            enterStart = Color.parseColor("#1A73E8"),
            enterEnd = Color.parseColor("#1E6DEB"),
            suggestionBg = Color.parseColor("#EEF4FB"),
            suggestionDivider = Color.parseColor("#DFE8F6"),
            settingsBg = Color.parseColor("#F8FAFC"),
            voiceBarBg = Color.parseColor("#EEF4FB"),
            popupBg = Color.WHITE,
            popupStroke = Color.parseColor("#DFE8F6"),
            pillBg = Color.WHITE,
            pillText = Color.parseColor("#1E293B"),
            pillBorder = Color.parseColor("#D8E2F0"),
            popupSelectedBg = Color.parseColor("#DFE8F6"),
            toolPillBg = Color.WHITE,
            toolPillBorder = Color.parseColor("#D8E2F0"),
            predictionChipBg = Color.WHITE,
            predictionChipBorder = Color.parseColor("#D8E2F0"),
            ribbonBorder = Color.TRANSPARENT,
        )

        fun fromIsDark(isDark: Boolean) = if (isDark) dark else light
    }
}
