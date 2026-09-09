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
            bg = Color.parseColor("#070A12"),
            keyLetter = Color.parseColor("#141A29"),
            keyAction = Color.parseColor("#192236"),
            keyText = Color.parseColor("#E2E8F0"),
            hintText = Color.parseColor("#64748B"),
            toolbarBg = Color.parseColor("#0F1424"),
            toolbarText = Color.parseColor("#CBD5E1"),
            resultBg = Color.parseColor("#090D18"),
            primary = Color.parseColor("#6366F1"),
            accentCyan = Color.parseColor("#22D3EE"),
            enterStart = Color.parseColor("#4F46E5"),
            enterEnd = Color.parseColor("#06B6D4"),
            suggestionBg = Color.parseColor("#0B0F19"),
            suggestionDivider = Color.parseColor("#1E293B"),
            settingsBg = Color.parseColor("#090D18"),
            voiceBarBg = Color.parseColor("#090D18"),
            popupBg = Color.parseColor("#1E293B"),
            popupStroke = Color.parseColor("#6366F1"),
            pillBg = Color.parseColor("#182033"),
            pillText = Color.parseColor("#E2E8F0"),
            pillBorder = Color.parseColor("#1F293D"),
            popupSelectedBg = Color.parseColor("#223152"),
            toolPillBg = Color.parseColor("#1E293B"),
            toolPillBorder = Color.parseColor("#334155"),
            predictionChipBg = Color.parseColor("#083344"),
            predictionChipBorder = Color.parseColor("#155E75"),
            ribbonBorder = Color.parseColor("#1E293B"),
        )

        val light = KeyboardTheme(
            bg = Color.parseColor("#E8EDF5"),
            keyLetter = Color.WHITE,
            keyAction = Color.parseColor("#D5DCE8"),
            keyText = Color.parseColor("#0F172A"),
            hintText = Color.parseColor("#64748B"),
            toolbarBg = Color.parseColor("#F8FAFC"),
            toolbarText = Color.parseColor("#334155"),
            resultBg = Color.WHITE,
            primary = Color.parseColor("#6366F1"),
            accentCyan = Color.parseColor("#0891B2"),
            enterStart = Color.parseColor("#4F46E5"),
            enterEnd = Color.parseColor("#06B6D4"),
            suggestionBg = Color.parseColor("#F1F5F9"),
            suggestionDivider = Color.parseColor("#E2E8F0"),
            settingsBg = Color.parseColor("#F8FAFC"),
            voiceBarBg = Color.parseColor("#F1F5F9"),
            popupBg = Color.WHITE,
            popupStroke = Color.parseColor("#C7D2FE"),
            pillBg = Color.WHITE,
            pillText = Color.parseColor("#0F172A"),
            pillBorder = Color.parseColor("#E2E8F0"),
            popupSelectedBg = Color.parseColor("#EEF2FF"),
            toolPillBg = Color.parseColor("#F1F5F9"),
            toolPillBorder = Color.parseColor("#E2E8F0"),
            predictionChipBg = Color.parseColor("#ECFEFF"),
            predictionChipBorder = Color.parseColor("#A5F3FC"),
            ribbonBorder = Color.parseColor("#E2E8F0"),
        )

        fun fromIsDark(isDark: Boolean) = if (isDark) dark else light
    }
}
