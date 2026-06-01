package com.typeeasy

import com.typeeasy.generated.ApiConfig
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.content.SharedPreferences
import android.graphics.Color
import android.graphics.PorterDuff
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.inputmethodservice.InputMethodService
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.text.method.ScrollingMovementMethod
import android.text.TextUtils
import android.view.*
import android.view.inputmethod.EditorInfo
import android.widget.*
import android.content.Intent
import android.os.Bundle
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.Locale
import java.util.concurrent.Executors

/**
 * Type Easy Keyboard — Datamuse suggestions, clipboard, app-synced light/dark theme.
 * - Long-press letter: popup with special chars for that key
 * - Long-press backspace: clear all text
 * - Professional Unicode icons throughout
 * - Translate & Grammar via TypeEasy API
 * - Voice input with SpeechRecognizer
 * - Emoji panel with category tabs
 */
class MyKeyboardService : InputMethodService() {

    // ── State ─────────────────────────────────────────────────────────────────
    private enum class Layer { ALPHA, SHIFT, CAPS, SYMBOLS, EMOJI }
    private var layer = Layer.ALPHA
    private var showSettings = false
    private var lastResultIsError = false

    // ── Prefs ─────────────────────────────────────────────────────────────────
    private lateinit var prefs: SharedPreferences
    private var fromLang = "en"
    private var toLang   = "ta"
    private var userId   = "0"

    // ── Languages ─────────────────────────────────────────────────────────────
    private val languages = listOf(
        "en" to "English","ta" to "Tamil","hi" to "Hindi","fr" to "French",
        "de" to "German","es" to "Spanish","ar" to "Arabic","zh" to "Chinese",
        "ja" to "Japanese","ko" to "Korean","ru" to "Russian","pt" to "Portuguese",
        "it" to "Italian","bn" to "Bengali","te" to "Telugu","ml" to "Malayalam",
        "kn" to "Kannada","mr" to "Marathi"
    )

    // ── Special chars per key (long-press popup) ──────────────────────────────
    // Format: key -> list of alternatives shown in popup
    private val keyAlternatives = mapOf(
        "q" to listOf("1","!","¡","¹"),
        "w" to listOf("2","@","ä","å"),
        "e" to listOf("3","#","é","è","ê","ë","€"),
        "r" to listOf("4","$","®","™"),
        "t" to listOf("5","%","þ","†"),
        "y" to listOf("6","^","ý","¥"),
        "u" to listOf("7","&","ü","ú","û","ù"),
        "i" to listOf("8","*","ï","î","í","ì"),
        "o" to listOf("9","(","ö","ó","ô","ò","°","ø"),
        "p" to listOf("0",")","π","£"),
        "a" to listOf("@","à","á","â","ã","ä","å","æ"),
        "s" to listOf("$","ß","§","ś"),
        "d" to listOf("&","ð","δ"),
        "f" to listOf("=","ƒ"),
        "g" to listOf("+","γ"),
        "h" to listOf("-","ħ"),
        "j" to listOf("_","ĵ"),
        "k" to listOf("/","κ"),
        "l" to listOf("\\","λ","£"),
        "z" to listOf("~","ζ","ž"),
        "x" to listOf("`","ξ","×"),
        "c" to listOf("<","ç","©","¢","č"),
        "v" to listOf(">","√"),
        "b" to listOf("[","β"),
        "n" to listOf("]","ñ","ń"),
        "m" to listOf("{","μ","m²","m³")
    )

    // ── Voice ─────────────────────────────────────────────────────────────────
    private var speechRecognizer: SpeechRecognizer? = null
    private var isListening = false

    // ── Voice command (cloud record → transcribe → execute) ───────────────────
    private var voiceCommandUi: KeyboardVoiceCommandUi? = null
    private var commandMediaRecorder: MediaRecorder? = null
    private var commandAudioFile: File? = null
    private var commandVoiceAssetId: String? = null
    private var commandOriginalTranscript: String = ""
    private var commandRecordingStartedAt = 0L
    private var commandTimerRunnable: Runnable? = null

    // Cloud dictation when Internal Transcribe is off
    private var dictationMediaRecorder: MediaRecorder? = null
    private var dictationAudioFile: File? = null
    private var isCloudDictationRecording = false

    // ── Background work ───────────────────────────────────────────────────────
    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())

    // ── View refs ─────────────────────────────────────────────────────────────
    private lateinit var rootLayout: LinearLayout
    private lateinit var suggestionRow: LinearLayout
    private lateinit var resultBar: LinearLayout
    private lateinit var resultLabel: TextView
    private lateinit var resultInsertBtn: TextView
    private lateinit var snackbarHost: FrameLayout
    private lateinit var snackbarLabel: TextView
    private var snackbarDismissRunnable: Runnable? = null
    private lateinit var voiceBar: LinearLayout
    private lateinit var voiceLabel: TextView
    private lateinit var settingsPanel: LinearLayout
    private lateinit var keysContainer: LinearLayout
    private lateinit var emojiPanel: FrameLayout
    private var popupWindow: PopupWindow? = null
    private var languagePopupWindow: PopupWindow? = null
    private var pendingReplaceSelected = false
    private var pendingReplaceBeforeChars = 0

    // ── Clipboard suggestion + history session ─────────────────────────────────
    private lateinit var clipboardBar: LinearLayout
    private lateinit var clipboardPreview: TextView
    private lateinit var clipboardSessionPanel: LinearLayout
    private lateinit var clipboardSessionContent: LinearLayout
    private lateinit var clipboardBackBtn: ImageView
    private lateinit var clipboardDeleteBtn: ImageView
    private lateinit var clipboardPinBtn: ImageView
    private lateinit var clipboardTitleView: TextView
    private lateinit var clipboardSelectAllBtn: TextView
    private var clipboardClipText: String? = null
    /** Hash of clipboard text already pasted from the suggestion — persisted until new copy. */
    private var consumedClipboardSignature: String? = null
    private var clipboardListener: ClipboardManager.OnPrimaryClipChangedListener? = null
    private var showClipboardSession = false
    private var clipboardSelectionMode = false
    private val clipboardSelectedIds = mutableSetOf<String>()
    private var clipboardRecentExpanded = false
    private var editorSupportsFirstCharCap = false
    private var pendingFirstCharCapitalize = false
    /** User tapped Shift to turn off caps — do not force first-letter uppercase. */
    private var userDeclinedFirstCharCap = false

    private data class ClipboardHistoryItem(val text: String, val pinned: Boolean = false)

    private companion object {
        const val PREF_CLIPBOARD_HISTORY = "kb_clipboard_history"
        const val PREF_CONSUMED_CLIPBOARD_SIG = "kb_consumed_clipboard_sig"
        const val MAX_CLIPBOARD_HISTORY = 15
        const val CLIPBOARD_RECENT_COLLAPSED = 3
        const val CLIPBOARD_CARD_WIDTH_DP = 196
    }

    // ── Word suggestions (Datamuse API) ───────────────────────────────────────
    private val datamuseExecutor = Executors.newSingleThreadExecutor()
    private var suggestionsRequestSeq = 0L
    private var suggestionDebounce: Runnable? = null
    private var keyPreviewPopup: PopupWindow? = null
    private var keyPreviewShownAt = 0L
    private var keyPreviewDismissRunnable: Runnable? = null
    private val keyPreviewMinVisibleMs = 11L
    private lateinit var featureToolbar: LinearLayout
    private lateinit var suggestionToolbarDivider: View
    private var currentPartialWord = ""
    private var isFetchingSuggestions = false
    private lateinit var suggestionScroll: HorizontalScrollView
    private var keyboardIsDark = false
    private var theme = KeyboardTheme.light
    private val C_BG get() = theme.bg
    private val C_KEY_LETTER get() = theme.keyLetter
    private val C_KEY_ACTION get() = theme.keyAction
    private val C_KEY_TEXT get() = theme.keyText
    private val C_HINT_TEXT get() = theme.hintText
    private val C_TOOLBAR_BG get() = theme.toolbarBg
    private val C_TOOLBAR_TXT get() = theme.toolbarText
    private val C_RESULT_BG get() = theme.resultBg
    private val C_PRIMARY get() = theme.primary
    private val C_SUGGESTION get() = theme.suggestionBg
    private val C_ERROR_TEXT get() = Color.parseColor("#DC2626")
    private val C_SUCCESS get() = Color.parseColor("#16A34A")


    // ── Number hints for top row ──────────────────────────────────────────────
    private val topRowHints = mapOf(
        "q" to "1","w" to "2","e" to "3","r" to "4","t" to "5",
        "y" to "6","u" to "7","i" to "8","o" to "9","p" to "0"
    )

    // ── Keyboard rows ─────────────────────────────────────────────────────────
    private val alphaRows = listOf(
        listOf("q","w","e","r","t","y","u","i","o","p"),
        listOf("a","s","d","f","g","h","j","k","l"),
        listOf("SHIFT","z","x","c","v","b","n","m","BKSP"),
        listOf("?123","/","EMOJI","space",".","ENTER")
    )
    private val symbolRows = listOf(
        listOf("1","2","3","4","5","6","7","8","9","0"),
        listOf("@","#","$","%","&","-","+","(",")","/"),
        listOf("=","*","\"","'",":",";","!","?","BKSP"),
        listOf("ABC",",","EMOJI","space",".","ENTER")
    )

    // ── Emoji categories ──────────────────────────────────────────────────────
    private val emojiCategories = listOf(
        "😀" to listOf("😀","😃","😄","😁","😆","😅","🤣","😂","🙂","😉","😊","😇","🥰","😍","🤩","😘","😋","😛","😜","🤪","😝","🤑","🤗","🤔","😐","😑","😶","😏","😒","🙄","😬","😌","😔","😪","😴","😷","🤒","🤕","🤢","🤮","🤧","🥵","🥶","😵","🤯","🤠","🥳","😎","🤓","😕","😟","🙁","☹️","😮","😲","😳","🥺","😦","😧","😨","😰","😥","😢","😭","😱","😖","😣","😞","😓","😩","😫","🥱","😤","😡","😠","🤬","😈","👿","💀","☠️","💩","🤡","👹","👺","👻","👽","👾","🤖"),
        "👋" to listOf("👋","🤚","🖐","✋","🖖","👌","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","👇","☝️","👍","👎","✊","👊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","✍️","💅","💪","🦾","🦵","🦶","👂","👃","👀","👅","👄","💋"),
        "👶" to listOf("👶","👧","🧒","👦","👩","🧑","👨","👩‍🦱","🧑‍🦱","👨‍🦱","👩‍🦰","🧑‍🦰","👨‍🦰","👱‍♀️","👱","👱‍♂️","👩‍🦳","🧑‍🦳","👨‍🦳","👩‍🦲","🧑‍🦲","👨‍🦲","👵","🧓","👴","🧕","👲","🪕","🥻","🤵‍♀️","🤵","🤵‍♂️","👰‍♀️","👰","👰‍♂️","🤰","🤱","👩‍🍼","🧑‍🍼","👨‍🍼","🧎‍♀️","🧎","🧎‍♂️","🧍‍♀️","🧍","🧍‍♂️","🚶‍♀️","🚶","🚶‍♂️","🏃‍♀️","🏃","🏃‍♂️","💃","🕺","🧗‍♀️","🧗","🧗‍♂️","🤺","🏇","⛷️","🏂","🏌️‍♀️","🏌️","🏌️‍♂️","🏄‍♀️","🏄","🏄‍♂️","🚣‍♀️","🚣","🚣‍♂️","🏊‍♀️","🏊","🏊‍♂️"),
        "🧑‍⚕️" to listOf("🧑‍⚕️","👩‍⚕️","👨‍⚕️","🧑‍🎓","👩‍🎓","👨‍🎓","🧑‍🏫","👩‍🏫","👨‍🏫","🧑‍⚖️","👩‍⚖️","👨‍⚖️","🧑‍🌾","👩‍🌾","👨‍🌾","🧑‍🍳","👩‍🍳","👨‍🍳","🧑‍🔧","👩‍🔧","👨‍🔧","🧑‍🏭","👩‍🏭","👨‍🏭","🧑‍💼","👩‍💼","👨‍💼","🧑‍🔬","👩‍🔬","👨‍🔬","🧑‍💻","👩‍💻","👨‍💻","🧑‍🎤","👩‍🎤","👨‍🎤","🧑‍🎨","👩‍🎨","👨‍🎨","🧑‍✈️","👩‍✈️","👨‍✈️","🧑‍🚀","👩‍🚀","👨‍🚀","🧑‍🚒","👩‍🚒","👨‍🚒","👮‍♀️","👮","👮‍♂️","🕵️‍♀️","🕵️","🕵️‍♂️","💂‍♀️","💂","💂‍♂️","🥷","👷‍♀️","👷","👷‍♂️","👑","🤴","👸","🧙‍♀️","🧙","🧙‍♂️","🧚‍♀️","🧚","🧚‍♂️","🧛‍♀️","🧛","🧛‍♂️","🧜‍♀️","🧜","🧜‍♂️","🧝‍♀️","🧝","🧝‍♂️","🧞‍♀️","🧞","🧞‍♂️","🧟‍♀️","🧟","🧟‍♂️"),
        "👪" to listOf("💑","👩‍❤️‍👨","👨‍❤️‍👨","👩‍❤️‍👩","💏","👩‍❤️‍💋‍👨","👨‍❤️‍💋‍👨","👩‍❤️‍💋‍👩","👪","👨‍👩‍👦","👨‍👩‍👧","👨‍👩‍👧‍👦","👨‍👩‍👦‍👦","👨‍👩‍👧‍👧","👩‍👩‍👦","👩‍👩‍👧","👩‍👩‍👧‍👦","👩‍👩‍👦‍👦","👩‍👩‍👧‍👧","👨‍👨‍👦","👨‍👨‍👧","👨‍👨‍👧‍👦","👨‍👨‍👦‍👦","👨‍👨‍👧‍👧","👩‍👦","👩‍👧","👩‍👧‍👦","👩‍👦‍👦","👩‍👧‍👧","👨‍👦","👨‍👧","👨‍👧‍👦","👨‍👦‍👦","👨‍👧‍👧","🧑‍🤝‍🧑","👭","👫","👬"),
        "🐶" to listOf("🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🙈","🙉","🙊","🐔","🐧","🐦","🐤","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🐛","🦋","🐌","🐞","🐜","🐢","🐍","🦎","🐙","🦑","🦐","🦀","🐡","🐠","🐟","🐬","🐳","🐋","🦈","🐊","🐅","🐆","🦓","🐘","🦛","🦏","🐪","🐫","🦒","🦘","🐃","🐂","🐄","🐎","🐖","🐏","🐑","🦙","🐐","🦌","🐕","🐩","🐈","🐓","🦃","🦚","🦜","🦢","🦩","🕊","🐇","🦝","🦨","🦡","🦦","🦥","🐁","🐀","🐿","🦔"),
        "🍎" to listOf("🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍈","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🍆","🥑","🥦","🥬","🥒","🌶","🧄","🧅","🥔","🍠","🥐","🥯","🍞","🥖","🥨","🧀","🥚","🍳","🧈","🥞","🧇","🥓","🥩","🍗","🍖","🌭","🍔","🍟","🍕","🥪","🥙","🧆","🌮","🌯","🥗","🥘","🥫","🍝","🍜","🍲","🍛","🍣","🍱","🥟","🍤","🍙","🍚","🍘","🍥","🥮","🍢","🧁","🍰","🎂","🍮","🍭","🍬","🍫","🍿","🍩","🍪","🌰","🥜","🍯","🧃","🥤","🧋","☕","🍵","🫖","🍺","🍻","🥂","🍷","🥃","🍸","🍹","🧉","🍾"),
        "⚽" to listOf("⚽","🏀","🏈","⚾","🥎","🎾","🏐","🏉","🥏","🎱","🪀","🏓","🏸","🏒","🏑","🥍","🏏","🥅","⛳","🎣","🤿","🥊","🥋","🎽","🛹","🛼","🛷","⛸","🥌","🎿","⛷","🏂","🪂","🏋️","🤼","🤸","⛹️","🤺","🏇","🧘","🏄","🏊","🤽","🚣","🧗","🚵","🚴","🏆","🥇","🥈","🥉","🏅","🎖","🏵","🎗","🎫","🎟","🎪","🤹","🎭","🩰","🎨","🎬","🎤","🎧","🎼","🎹","🥁","🪘","🎷","🎺","🎸","🪕","🎻","🎲","♟","🎯","🎳","🎮","🎰","🧩"),
        "🚗" to listOf("🚗","🚕","🚙","🚌","🚎","🏎","🚓","🚑","🚒","🚐","🛻","🚚","🚛","🚜","🏍","🛵","🛺","🚲","🛴","🛹","🛼","⛽","🚨","🚥","🚦","🛑","🚧","⚓","🛟","⛵","🚤","🛥","🛳","⛴","🚢","✈️","🛩","🛫","🛬","🪂","💺","🚁","🚟","🚠","🚡","🛰","🚀","🛸","🪐","🌍","🌎","🌏","🌐","🗺","🧭","🏔","⛰","🌋","🗻","🏕","🏖","🏜","🏝","🏞","🏟","🏛","🏗","🧱","🛖","🏘","🏚","🏠","🏡","🏢","🏣","🏤","🏥","🏦","🏨","🏩","🏪","🏫","🏬","🏭","🏯","🏰","💒","🗼","🗽","⛪","🕌","🛕","🕍","⛩","🕋","⛲","⛺","🌁","🌃","🏙","🌄","🌅","🌆","🌇","🌉","♨️","🎠","🎡","🎢","💈","🎪"),
        "💡" to listOf("💡","🔦","🕯","🪔","🧯","🛢","💰","💴","💵","💶","💷","💸","💳","🪙","💹","📈","📉","📊","📋","📌","📍","📎","🖇","📏","📐","✂️","🗃","🗄","🗑","🔒","🔓","🔏","🔐","🔑","🗝","🔨","🪓","⛏","⚒","🛠","🗡","⚔️","🔫","🪃","🏹","🛡","🪚","🔧","🪛","🔩","⚙️","🗜","⚖️","🦯","🔗","⛓","🪝","🧲","🪜","⚗️","🧪","🧫","🧬","🔬","🔭","📡","💉","🩸","💊","🩹","🩺","🩻","🚪","🛗","🪞","🪟","🛏","🛋","🪑","🚽","🚿","🛁","🧴","🧷","🧹","🧺","🧻","🪣","🧼","🫧","🪥","🧽","🛒"),
        "👕" to listOf("👕","👖","🧣","🧤","🧥","🧦","👗","キム","👚","👛","👜","👝","🎒","🧳","👞","👟","🥾","🥿","👠","👡","👢","👑","👒","🎩","🎓","🧢","🪖","⛑","💄","💍","💼","🕶","👓","🥽","🌂","☂️"),
        "❤️" to listOf("❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❤️‍🔥","❤️‍🩹","❣️","💕","💞","💓","💗","💖","💘","💝","💟","☮️","✝️","☪️","🕉","☸️","✡️","🔯","🕎","☯️","☦️","🛐","⛎","♈","♉","♊","♋","♌","♍","♎","♏","♐","♑","♒","♓","🆔","⚛️","🈳","🈹","☢️","☣️","📴","📳","🈶","🈚","🈸","營","🈴","🈲","💮","💯","🚼","閉","🛑","⛔","📛","🚫","❌","⭕","💢","♨️","🚷","🚯","🚳","🚱","🚸","⛔","⚠️","🚸"),
        "☀️" to listOf("☀️","🌤","⛅","🌥","🌦","☁️","🌧","⛈","🌩","🌨","❄️","☃️","⛄","🌬","💨","🌪","🌫","🌊","💧","💦","💨","☔","☂️","⚡","🔥","💥","✨","🌟","⭐","🪐","🌙","🌛","🌜","🌚","🌕","🌖","🌗","🌘","🌑","🌒","🌓","🌔","📅","📆","🗓"),
        "🏁" to listOf("🏁","🚩","🎌","🏴","🏳️","🏳️‍🌈","🏳️‍⚧️","🏴‍☠️","🇦🇩","🇦🇪","🇦🇫","🇦🇬","🇦🇮","🇦🇱","🇦🇲","🇦🇴","🇦🇷","🇦🇸","🇦🇹","🇦🇺","🇦🇼","🇦🇽","🇦🇿","🇧🇦","🇧🇧","🇧🇩","🇧🇪","🇧🇫","🇧🇬","🇧🇭","🇧🇮","🇧🇯","🇧🇲","🇧🇳","🇧🇴","🇧🇷","🇧🇸","🇧🇹","🇧🇻","🇧🇼","🇧🇾","🇧🇿","🇨🇦","🇨🇨","🇨🇩","🇨🇫","🇨🇬","🇨🇭","🇨🇮","🇨🇰","🇨🇱","🇨🇲","🇨🇳","🇨🇴","🇨🇵","🇨🇷","🇨🇺","🇨🇻","🇨🇼","🇨🇽","🇨🇾","🇨🇿","🇩🇪","🇩🇬","🇩🇯","🇩🇰","🇩🇲","🇩🇴","🇩🇿","🇪🇦","🇪🇨","🇪🇪","🇪🇬","🇪🇭","🇪🇷","🇪🇸","🇪🇹","🇪🇺","🇫🇮","🇫🇯","🇫🇰","🇫🇲","🇫🇴","🇫🇷","🇬🇦","🇬🇧","🇬🇩","🇬🇪","🇬🇫","🇬🇬","🇬🇭","🇬🇮","🇬🇱","🇬🇲","🇬🇳","🇬🇵","🇬🇶","🇬🇷","🇬🇸","🇬🇹","🇬🇺","🇬🇼","🇬🇾","🇭🇰","🇭🇲","🇭🇳","🇭🇷","🇭🇹","🇭🇺","🇮🇨","🇮🇩","🇮🇪","🇮🇱","🇮🇲","🇮🇳","🇮🇴","🇮🇶","🇮🇷","🇮🇸","🇮🇹","🇯🇪","🇯🇲","🇯🇴","🇯🇵","🇰🇪","🇰🇬","🇰🇭","🇰🇮","🇰🇲","🇰🇳","🇰🇵","🇰🇷","🇰🇼","🇰🇾","🇰🇿","🇱🇦","🇱🇧","🇱🇨","🇱🇮","🇱🇰","🇱🇷","🇱🇸","🇱🇹","🇱🇺","🇱🇻","🇱🇾","🇲🇦","🇲🇨","🇲🇩","🇲🇪","🇲🇫","🇲🇬","🇲🇭","🇲🇰","🇲🇱","🇲🇲","🇲🇳","🇲🇴","🇲🇵","🇲🇶","🇲🇷","🇲🇸","🇲🇹","🇲🇺","🇲🇻","🇲🇼","🇲🇽","🇲🇾","🇲🇿","🇳🇦","🇳🇨","🇳🇪","🇳🇫","🇳🇬","🇳🇮","🇳🇱","🇳🇴","🇳🇵","🇳🇷","🇳🇺","🇳🇿","🇴🇲","🇵🇦","🇵🇪","🇵🇫","🇵🇬","🇵🇭","🇵🇰","🇵🇱","🇵🇲","🇵🇳","🇵🇷","🇵🇸","🇵🇹","🇵🇼","🇵🇾","🇶🇦","🇷🇪","🇷🇴","🇷🇸","🇷🇺","🇷🇼","🇸🇦","🇸🇧","🇸🇨","🇸🇩","🇸🇪","🇸🇬","🇸🇭","🇸🇮","🇸🇯","🇸🇰","🇸🇱","🇸🇲","🇸🇳","🇸🇴","🇸🇷","🇸🇸","🇸🇹","🇸🇻","🇸🇽","🇸🇾","🇸🇿","🇹🇦","🇹🇨","🇹🇩","🇹🇫","🇹🇬","🇹🇭","🇹🇯","🇹🇰","🇹🇱","🇹🇲","🇹🇳","🇹🇴","🇹🇷","🇹🇹","🇹🇻","🇹🇼","🇹🇿","🇺🇦","🇺🇬","🇺🇲","🇺🇳","🇺🇸","🇺🇾","🇺🇿","🇻🇦","🇻🇨","🇻🇪","🇻🇬","🇻🇮","🇻🇳","🇻🇺","🇼🇫","🇼🇸","🇽🇰","🇾🇪","🇾🇹","🇿🇦","🇿🇲","🇿🇼","🏴󠁧󠁢󠁥󠁮󠁧󠁿","🏴󠁧󠁢󠁳󠁣󠁴󠁿","🏴󠁧󠁢󠁷󠁬󠁳󠁿"),
        "🌱" to listOf("🌱","🪴","🌲","🌳","🌴","🌵","🌾","🌿","🍀","🍁","🍂","🍃","🍄","🐚","🪨","🪵","🌹","产","🌸","💮","🏵️","🌺","🌻","🌼","🌷","🌱","🌿")
    )

    private val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
    private val WRAP  = ViewGroup.LayoutParams.WRAP_CONTENT
    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
    private fun roundRect(color: Int, radius: Int): GradientDrawable =
        GradientDrawable().apply { setColor(color); cornerRadius = radius.toFloat() }

    // ─────────────────────────────────────────────────────────────────────────
    // Lifecycle
    // ─────────────────────────────────────────────────────────────────────────

    override fun onCreate() {
        super.onCreate()
        prefs = getSharedPreferences(KeyboardModule.PREFS, Context.MODE_PRIVATE)
        refreshKeyboardConfig()
    }

    override fun onCreateInputView(): View {
        refreshKeyboardConfig()
        rootLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(C_BG)
            layoutParams = ViewGroup.LayoutParams(MATCH, WRAP)
        }
        buildClipboardSuggestionBar()
        buildClipboardSessionPanel()
        buildSuggestionRow()
        buildSuggestionToolbarDivider()
        buildFeatureToolbar()
        buildResultBar()
        buildVoiceBar()
        buildVoiceCommandPanel()
        buildSettingsPanel()
        buildKeys()
        buildEmojiPanel()
        buildSnackbarOverlay()
        applyThemeToViews()
        registerClipboardListener()
        refreshClipboardSuggestion()
        val wrapper = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(MATCH, WRAP)
            addView(rootLayout, FrameLayout.LayoutParams(MATCH, WRAP))
            addView(
                snackbarHost,
                FrameLayout.LayoutParams(MATCH, WRAP, Gravity.BOTTOM),
            )
        }
        return wrapper
    }

    override fun onStartInputView(info: EditorInfo?, restarting: Boolean) {
        super.onStartInputView(info, restarting)
        refreshKeyboardConfig()
        applyThemeToViews()
        renderSettingsPanel()
        updateSuggestions()
        userDeclinedFirstCharCap = false
        editorSupportsFirstCharCap = shouldOfferFirstCharCapitalize(info)
        pendingFirstCharCapitalize = editorSupportsFirstCharCap && isInputEmptyForFirstCharCap()
        applyInitialShiftForEmptyField()
        refreshClipboardSuggestion()
    }

    override fun onUpdateSelection(
        oldSelStart: Int,
        oldSelEnd: Int,
        newSelStart: Int,
        newSelEnd: Int,
        candidatesStart: Int,
        candidatesEnd: Int,
    ) {
        super.onUpdateSelection(
            oldSelStart,
            oldSelEnd,
            newSelStart,
            newSelEnd,
            candidatesStart,
            candidatesEnd,
        )
        if (voiceCommandUi?.shouldRouteKeysToTranscript() == true) {
            voiceCommandUi?.releaseTranscriptEditing()
        }
        if (editorSupportsFirstCharCap && !userDeclinedFirstCharCap) {
            val empty = isInputEmptyForFirstCharCap()
            pendingFirstCharCapitalize = empty
            if (empty) applyInitialShiftForEmptyField()
        }
    }

    override fun onFinishInput() {
        super.onFinishInput()
        dismissAlternativesPopup()
        languagePopupWindow?.dismiss()
        dismissKeyPreview(immediate = true)
        stopVoice()
        cancelVoiceCommandFlow()
        releaseDictationRecorder()
        runCatching { dictationAudioFile?.delete() }
        dictationAudioFile = null
        hideResult()
        hideSnackbar()
        clipboardSelectionMode = false
        clipboardSelectedIds.clear()
        showClipboardSession = false
        updateKeyboardPanelsVisibility()
        if (showSettings) toggleSettings()
        userDeclinedFirstCharCap = false
        if (layer == Layer.EMOJI) setLayer(Layer.ALPHA)
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        val wasDark = keyboardIsDark
        keyboardIsDark = resolveKeyboardIsDark()
        if (wasDark != keyboardIsDark && ::rootLayout.isInitialized) {
            applyThemeToViews()
        }
    }

    override fun onDestroy() {
        dismissAlternativesPopup()
        languagePopupWindow?.dismiss()
        dismissKeyPreview(immediate = true)
        suggestionDebounce?.let { mainHandler.removeCallbacks(it) }
        stopVoice()
        cancelVoiceCommandFlow()
        hideSnackbar()
        unregisterClipboardListener()
        executor.shutdownNow()
        datamuseExecutor.shutdownNow()
        super.onDestroy()
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Clipboard suggestion (above word suggestions)
    // ─────────────────────────────────────────────────────────────────────────

    private fun buildClipboardSuggestionBar() {
        clipboardBar = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(MATCH, WRAP)
            visibility = View.GONE
            setPadding(dp(12), dp(5), dp(12), dp(2))
            setBackgroundColor(Color.TRANSPARENT)
            isClickable = true
            isFocusable = true
            setOnClickListener { pasteClipboardToFocusedField() }
        }
        clipboardBar.addView(TextView(this).apply {
            text = "Clipboard Suggestion"
            textSize = 10f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(C_HINT_TEXT)
            includeFontPadding = false
            setPadding(0, 0, 0, 0)
        })
        clipboardPreview = TextView(this).apply {
            textSize = 14f
            maxLines = 2
            ellipsize = android.text.TextUtils.TruncateAt.END
            setTextColor(C_KEY_TEXT)
            includeFontPadding = false
            setPadding(0, dp(1), 0, 0)
        }
        clipboardBar.addView(clipboardPreview)
        rootLayout.addView(clipboardBar, 0)
    }

    private fun buildClipboardSessionPanel() {
        clipboardSessionPanel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(MATCH, dp(300))
            visibility = View.GONE
            setBackgroundColor(C_BG)
        }

        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(4), dp(6), dp(8), dp(4))
        }
        clipboardBackBtn = ImageView(this).apply {
            setImageResource(R.drawable.ic_arrow_back)
            setColorFilter(C_KEY_TEXT, PorterDuff.Mode.SRC_IN)
            scaleType = ImageView.ScaleType.CENTER_INSIDE
            layoutParams = LinearLayout.LayoutParams(dp(44), dp(44))
            setPadding(dp(10), dp(10), dp(10), dp(10))
            setOnClickListener { onClipboardBackPressed() }
        }
        clipboardSelectAllBtn = TextView(this).apply {
            text = "All"
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(C_KEY_TEXT)
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(8), dp(8), dp(8), dp(8))
            visibility = View.GONE
            setOnClickListener { toggleClipboardSelectAll() }
        }
        clipboardTitleView = TextView(this).apply {
            text = "Clipboard"
            textSize = 17f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(C_KEY_TEXT)
            layoutParams = LinearLayout.LayoutParams(0, WRAP, 1f)
        }
        clipboardPinBtn = ImageView(this).apply {
            setImageResource(R.drawable.ic_pin)
            setColorFilter(C_KEY_TEXT, PorterDuff.Mode.SRC_IN)
            scaleType = ImageView.ScaleType.CENTER_INSIDE
            layoutParams = LinearLayout.LayoutParams(dp(44), dp(44))
            setPadding(dp(10), dp(10), dp(10), dp(10))
            setOnClickListener { onClipboardPinPressed() }
        }
        clipboardDeleteBtn = ImageView(this).apply {
            setImageResource(R.drawable.ic_delete)
            setColorFilter(C_KEY_TEXT, PorterDuff.Mode.SRC_IN)
            scaleType = ImageView.ScaleType.CENTER_INSIDE
            layoutParams = LinearLayout.LayoutParams(dp(44), dp(44))
            setPadding(dp(10), dp(10), dp(10), dp(10))
            setOnClickListener { onClipboardDeletePressed() }
        }
        header.addView(clipboardBackBtn)
        header.addView(clipboardSelectAllBtn)
        header.addView(clipboardTitleView)
        header.addView(clipboardPinBtn)
        header.addView(clipboardDeleteBtn)

        val scroll = ScrollView(this).apply {
            layoutParams = LinearLayout.LayoutParams(MATCH, 0, 1f)
            isVerticalScrollBarEnabled = false
        }
        clipboardSessionContent = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(8), 0, dp(8), dp(8))
        }
        scroll.addView(clipboardSessionContent)
        clipboardSessionPanel.addView(header)
        clipboardSessionPanel.addView(scroll)
        rootLayout.addView(clipboardSessionPanel)
    }

    private fun clipboardCardBgColor(): Int = C_KEY_LETTER

    private fun clipboardCardTextColor(): Int = C_KEY_TEXT

    private fun loadConsumedClipboardSignature(): String? {
        if (consumedClipboardSignature == null) {
            consumedClipboardSignature = prefs.getString(PREF_CONSUMED_CLIPBOARD_SIG, null)
        }
        return consumedClipboardSignature
    }

    private fun onClipboardBackPressed() {
        if (clipboardSelectionMode) {
            clipboardSelectionMode = false
            clipboardSelectedIds.clear()
            renderClipboardSession()
            return
        }
        toggleClipboardSession(false)
    }

    private fun onClipboardDeletePressed() {
        if (!clipboardSelectionMode || clipboardSelectedIds.isEmpty()) return
        deleteClipboardItems(clipboardSelectedIds.toSet())
        clipboardSelectionMode = false
        clipboardSelectedIds.clear()
        renderClipboardSession()
    }

    private fun onClipboardPinPressed() {
        if (!clipboardSelectionMode || clipboardSelectedIds.isEmpty()) return
        val list = loadClipboardHistory()
        list.forEachIndexed { idx, item ->
            if (clipboardSelectedIds.contains(item.id())) {
                list[idx] = item.copy(pinned = !item.pinned)
            }
        }
        val pinned = list.filter { it.pinned }
        val unpinned = list.filter { !it.pinned }
        saveClipboardHistory((pinned + unpinned).take(MAX_CLIPBOARD_HISTORY))
        clipboardSelectionMode = false
        clipboardSelectedIds.clear()
        renderClipboardSession()
    }

    private fun toggleClipboardSelectAll() {
        val items = loadClipboardHistory()
        if (items.isEmpty()) return
        val allSelected = clipboardSelectedIds.size >= items.size
        if (allSelected) {
            clipboardSelectionMode = false
            clipboardSelectedIds.clear()
        } else {
            clipboardSelectionMode = true
            clipboardSelectedIds.clear()
            items.forEach { clipboardSelectedIds.add(it.id()) }
        }
        renderClipboardSession()
    }

    private fun updateClipboardHeaderForSelection() {
        val items = loadClipboardHistory()
        if (clipboardSelectionMode) {
            clipboardSelectAllBtn.visibility = View.VISIBLE
            val allSelected = items.isNotEmpty() && clipboardSelectedIds.size >= items.size
            clipboardSelectAllBtn.text = if (allSelected) "✓ All" else "All"
            clipboardTitleView.text = "${clipboardSelectedIds.size} selected"
            clipboardPinBtn.alpha = if (clipboardSelectedIds.isEmpty()) 0.35f else 1f
            clipboardDeleteBtn.alpha = if (clipboardSelectedIds.isEmpty()) 0.35f else 1f
        } else {
            clipboardSelectAllBtn.visibility = View.GONE
            clipboardTitleView.text = "Clipboard"
            clipboardPinBtn.alpha = 0.35f
            clipboardDeleteBtn.alpha = 0.35f
        }
    }

    private fun ClipboardHistoryItem.id(): String = text.hashCode().toString()

    private fun deleteClipboardItems(ids: Set<String>) {
        val list = loadClipboardHistory().filter { it.id() !in ids }
        saveClipboardHistory(list)
    }

    private fun enterClipboardSelection(itemId: String) {
        clipboardSelectionMode = true
        clipboardSelectedIds.clear()
        clipboardSelectedIds.add(itemId)
        runCatching {
            @Suppress("DEPRECATION")
            (getSystemService(Context.VIBRATOR_SERVICE) as? android.os.Vibrator)?.vibrate(20L)
        }
        renderClipboardSession()
    }

    private fun toggleClipboardItemSelection(itemId: String) {
        if (clipboardSelectedIds.contains(itemId)) clipboardSelectedIds.remove(itemId)
        else clipboardSelectedIds.add(itemId)
        if (clipboardSelectedIds.isEmpty()) clipboardSelectionMode = false
        renderClipboardSession()
    }

    private fun registerClipboardListener() {
        val mgr = getSystemService(CLIPBOARD_SERVICE) as? ClipboardManager ?: return
        if (clipboardListener != null) return
        clipboardListener = ClipboardManager.OnPrimaryClipChangedListener {
            mainHandler.post {
                recordClipboardFromSystem()
                refreshClipboardSuggestion()
                if (showClipboardSession) renderClipboardSession()
            }
        }
        mgr.addPrimaryClipChangedListener(clipboardListener!!)
    }

    private fun unregisterClipboardListener() {
        val mgr = getSystemService(CLIPBOARD_SERVICE) as? ClipboardManager ?: return
        clipboardListener?.let { mgr.removePrimaryClipChangedListener(it) }
        clipboardListener = null
    }

    private fun readClipboardPlainText(): String? {
        val mgr = getSystemService(CLIPBOARD_SERVICE) as? ClipboardManager ?: return null
        if (!mgr.hasPrimaryClip()) return null
        val clip = mgr.primaryClip ?: return null
        if (clip.itemCount < 1) return null
        val item = clip.getItemAt(0)
        val text = item.coerceToText(this)?.toString()?.trim().orEmpty()
        return text.ifBlank { null }
    }

    private fun clipboardSignature(text: String): String = text.hashCode().toString()

    private fun loadClipboardHistory(): MutableList<ClipboardHistoryItem> {
        val raw = prefs.getString(PREF_CLIPBOARD_HISTORY, null) ?: return mutableListOf()
        return try {
            val arr = JSONArray(raw)
            val list = mutableListOf<ClipboardHistoryItem>()
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                val text = o.optString("text", "").trim()
                if (text.isNotEmpty()) {
                    list.add(ClipboardHistoryItem(text, o.optBoolean("pinned", false)))
                }
            }
            list
        } catch (_: Exception) {
            mutableListOf()
        }
    }

    private fun saveClipboardHistory(items: List<ClipboardHistoryItem>) {
        val arr = JSONArray()
        items.forEach { item ->
            arr.put(
                JSONObject()
                    .put("text", item.text)
                    .put("pinned", item.pinned),
            )
        }
        prefs.edit().putString(PREF_CLIPBOARD_HISTORY, arr.toString()).apply()
    }

    private fun recordClipboardFromSystem() {
        val text = readClipboardPlainText() ?: return
        val list = loadClipboardHistory()
        list.removeAll { it.text == text }
        list.add(0, ClipboardHistoryItem(text))
        val pinned = list.filter { it.pinned }
        val unpinned = list.filter { !it.pinned }
        val merged = (pinned + unpinned).take(MAX_CLIPBOARD_HISTORY)
        saveClipboardHistory(merged)
    }

    private fun clearClipboardHistory() {
        saveClipboardHistory(emptyList())
    }

    private fun toggleClipboardPin(item: ClipboardHistoryItem) {
        val list = loadClipboardHistory()
        val idx = list.indexOfFirst { it.text == item.text }
        if (idx < 0) return
        list[idx] = list[idx].copy(pinned = !list[idx].pinned)
        val pinned = list.filter { it.pinned }
        val unpinned = list.filter { !it.pinned }
        saveClipboardHistory(pinned + unpinned)
    }

    private fun refreshClipboardSuggestion() {
        if (!::clipboardBar.isInitialized) return
        if (showClipboardSession || voiceCommandUi?.isActive == true) {
            clipboardBar.visibility = View.GONE
            return
        }
        val text = readClipboardPlainText()
        clipboardClipText = text
        if (text.isNullOrBlank()) {
            clipboardBar.visibility = View.GONE
            return
        }
        val sig = clipboardSignature(text)
        if (sig == loadConsumedClipboardSignature()) {
            clipboardBar.visibility = View.GONE
            return
        }
        val preview = if (text.length > 140) text.take(137) + "…" else text
        clipboardPreview.text = preview
        clipboardBar.visibility = View.VISIBLE
    }

    private fun markClipboardConsumed(text: String) {
        val sig = clipboardSignature(text)
        consumedClipboardSignature = sig
        prefs.edit().putString(PREF_CONSUMED_CLIPBOARD_SIG, sig).apply()
        if (::clipboardBar.isInitialized) {
            clipboardBar.visibility = View.GONE
        }
        clipboardClipText = null
    }

    private fun pasteClipboardText(text: String) {
        markClipboardConsumed(text)
        if (voiceCommandUi?.insertTranscriptText(text) == true) return
        val ic = currentInputConnection ?: return
        ic.commitText(text, 1)
        pendingFirstCharCapitalize = false
        if (layer == Layer.SHIFT) setLayer(Layer.ALPHA)
        updateSuggestions()
    }

    private fun pasteClipboardToFocusedField() {
        val text = clipboardClipText ?: readClipboardPlainText() ?: return
        pasteClipboardText(text)
    }

    private fun toggleClipboardSession(show: Boolean) {
        showClipboardSession = show
        if (show) {
            dismissAlternativesPopup()
            languagePopupWindow?.dismiss()
            if (showSettings) toggleSettings()
            clipboardSelectionMode = false
            clipboardSelectedIds.clear()
            recordClipboardFromSystem()
            renderClipboardSession()
        }
        updateKeyboardPanelsVisibility()
    }

    private fun renderClipboardSession() {
        if (!::clipboardSessionContent.isInitialized) return
        clipboardSessionContent.removeAllViews()
        updateClipboardHeaderForSelection()

        val items = loadClipboardHistory()
        if (items.isEmpty()) {
            clipboardSessionContent.addView(TextView(this).apply {
                text = "Copy text to see it here"
                textSize = 14f
                setTextColor(C_HINT_TEXT)
                gravity = Gravity.CENTER
                setPadding(0, dp(32), 0, dp(32))
            })
            return
        }

        val pinned = items.filter { it.pinned }
        val recent = items.filter { !it.pinned }
        val recentVisible = if (clipboardRecentExpanded) recent else recent.take(CLIPBOARD_RECENT_COLLAPSED)

        // Pinned clips always listed first (reference: pinned section on top)
        if (pinned.isNotEmpty()) {
            addClipboardSectionHeader(title = "Pinned", actionText = null, onAction = null)
            addClipboardHorizontalRow(pinned)
        }

        if (recent.isNotEmpty()) {
            addClipboardSectionHeader(
                title = "Recent",
                actionText = when {
                    recent.size <= CLIPBOARD_RECENT_COLLAPSED -> null
                    clipboardRecentExpanded -> "Show less"
                    else -> "Show more"
                },
                onAction = {
                    clipboardRecentExpanded = !clipboardRecentExpanded
                    renderClipboardSession()
                },
            )
            addClipboardHorizontalRow(recentVisible)
        }
    }

    private fun addClipboardSectionHeader(
        title: String,
        actionText: String?,
        onAction: (() -> Unit)?,
    ) {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(MATCH, WRAP).also { it.topMargin = dp(8) }
            setPadding(dp(4), dp(4), dp(4), dp(6))
        }
        row.addView(TextView(this).apply {
            text = title
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(C_KEY_TEXT)
            layoutParams = LinearLayout.LayoutParams(0, WRAP, 1f)
        })
        if (actionText != null && onAction != null) {
            row.addView(TextView(this).apply {
                text = actionText
                textSize = 13f
                setTextColor(C_PRIMARY)
                setPadding(dp(8), dp(4), dp(4), dp(4))
                setOnClickListener { onAction() }
            })
        }
        clipboardSessionContent.addView(row)
    }

    private fun addClipboardHorizontalRow(items: List<ClipboardHistoryItem>) {
        val scroll = HorizontalScrollView(this).apply {
            layoutParams = LinearLayout.LayoutParams(MATCH, WRAP)
            isHorizontalScrollBarEnabled = false
            overScrollMode = View.OVER_SCROLL_NEVER
            isFillViewport = false
        }
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 0, dp(8), dp(4))
        }
        items.forEach { item -> row.addView(buildClipboardCard(item, scroll)) }
        scroll.addView(row)
        clipboardSessionContent.addView(scroll)
    }

    private fun buildClipboardCard(item: ClipboardHistoryItem, parentScroll: HorizontalScrollView): View {
        val itemId = item.id()
        val selected = clipboardSelectionMode && clipboardSelectedIds.contains(itemId)
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(dp(CLIPBOARD_CARD_WIDTH_DP), WRAP).also {
                it.setMargins(0, 0, dp(8), 0)
            }
            setPadding(dp(12), dp(12), dp(12), dp(12))
            background = roundRect(
                if (selected) theme.popupSelectedBg else clipboardCardBgColor(),
                dp(14),
            ).also {
                if (selected) it.setStroke(dp(2), C_PRIMARY)
            }
            minimumHeight = dp(72)
            isClickable = true
            isLongClickable = true
        }

        val indicatorRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(MATCH, WRAP)
        }
        val circle = TextView(this).apply {
            textSize = 15f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(if (selected) C_PRIMARY else C_HINT_TEXT)
            layoutParams = LinearLayout.LayoutParams(WRAP, WRAP).also { it.setMargins(0, 0, dp(6), 0) }
        }
        if (clipboardSelectionMode) {
            circle.text = if (selected) "●" else "○"
            indicatorRow.addView(circle)
        } else if (item.pinned) {
            circle.text = "📌"
            circle.textSize = 12f
            indicatorRow.addView(circle)
        }
        card.addView(indicatorRow)

        card.addView(TextView(this).apply {
            text = item.text
            textSize = 13f
            setTextColor(clipboardCardTextColor())
            maxLines = 8
            ellipsize = null
        })

        val suppressClick = booleanArrayOf(false)
        card.setOnLongClickListener {
            suppressClick[0] = true
            parentScroll.requestDisallowInterceptTouchEvent(true)
            if (!clipboardSelectionMode) {
                enterClipboardSelection(itemId)
            } else {
                toggleClipboardItemSelection(itemId)
            }
            mainHandler.postDelayed({ suppressClick[0] = false }, 350L)
            true
        }
        card.setOnClickListener {
            if (suppressClick[0]) return@setOnClickListener
            if (clipboardSelectionMode) {
                toggleClipboardItemSelection(itemId)
            } else {
                pasteClipboardText(item.text)
                toggleClipboardSession(false)
            }
        }
        return card
    }

    private fun updateKeyboardPanelsVisibility() {
        if (!::keysContainer.isInitialized) return
        if (showClipboardSession) {
            if (::clipboardSessionPanel.isInitialized) clipboardSessionPanel.visibility = View.VISIBLE
            keysContainer.visibility = View.GONE
            emojiPanel.visibility = View.GONE
            if (::suggestionScroll.isInitialized) suggestionScroll.visibility = View.GONE
            if (::clipboardBar.isInitialized) clipboardBar.visibility = View.GONE
        } else {
            if (::clipboardSessionPanel.isInitialized) clipboardSessionPanel.visibility = View.GONE
            if (layer == Layer.EMOJI) {
                keysContainer.visibility = View.GONE
                emojiPanel.visibility = View.VISIBLE
            } else {
                emojiPanel.visibility = View.GONE
                keysContainer.visibility = View.VISIBLE
            }
            if (::suggestionScroll.isInitialized) suggestionScroll.visibility = View.VISIBLE
            refreshClipboardSuggestion()
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Suggestion row
    // ─────────────────────────────────────────────────────────────────────────

    private fun buildSuggestionRow() {
        suggestionScroll = HorizontalScrollView(this).apply {
            layoutParams = LinearLayout.LayoutParams(MATCH, dp(38))
            setBackgroundColor(C_SUGGESTION)
            isHorizontalScrollBarEnabled = false
        }
        suggestionRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            layoutParams = ViewGroup.LayoutParams(WRAP, MATCH)
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(12), dp(6), dp(12), dp(6))
        }
        suggestionScroll.addView(suggestionRow)
        rootLayout.addView(suggestionScroll)
    }

    private fun buildSuggestionToolbarDivider() {
        suggestionToolbarDivider = View(this).apply {
            layoutParams = LinearLayout.LayoutParams(MATCH, dp(1))
            setBackgroundColor(theme.suggestionDivider)
        }
        rootLayout.addView(suggestionToolbarDivider)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Feature toolbar — translate, grammar, voice, settings
    // ─────────────────────────────────────────────────────────────────────────

    private fun buildFeatureToolbar() {
        featureToolbar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(C_TOOLBAR_BG)
            layoutParams = LinearLayout.LayoutParams(MATCH, dp(44))
            setPadding(dp(10), dp(4), dp(10), dp(4))
            gravity = Gravity.CENTER_VERTICAL
        }
        featureToolbar.addView(toolBtn("文A") { onTranslatePress() })
        featureToolbar.addView(toolDivider())
        featureToolbar.addView(toolBtn("A✓") { onGrammarPress() })
        featureToolbar.addView(toolDivider())
        featureToolbar.addView(toolBtnIcon(R.drawable.ic_mic) { onVoicePress() })
        featureToolbar.addView(toolDivider())
        featureToolbar.addView(toolBtnIcon(R.drawable.ic_floating_menu_command) { onVoiceCommandPress() })
        featureToolbar.addView(toolDivider())
        featureToolbar.addView(toolBtnIcon(R.drawable.ic_clipboard) { toggleClipboardSession(true) })
        featureToolbar.addView(View(this).apply { layoutParams = LinearLayout.LayoutParams(0, 1, 1f) })
        featureToolbar.addView(toolBtn("⚙") { toggleSettings() })
        rootLayout.addView(featureToolbar)
    }

    private fun toolBtn(icon: String, action: () -> Unit) = TextView(this).apply {
        text = icon; textSize = 17f; gravity = Gravity.CENTER
        setTextColor(C_TOOLBAR_TXT); setBackgroundColor(Color.TRANSPARENT)
        typeface = Typeface.DEFAULT_BOLD
        layoutParams = LinearLayout.LayoutParams(dp(52), dp(40))
        setOnClickListener { action() }
    }

    private fun toolBtnIcon(drawableRes: Int, action: () -> Unit) = ImageView(this).apply {
        setImageResource(drawableRes)
        setColorFilter(C_TOOLBAR_TXT, PorterDuff.Mode.SRC_IN)
        scaleType = ImageView.ScaleType.CENTER_INSIDE
        layoutParams = LinearLayout.LayoutParams(dp(52), dp(40))
        setPadding(dp(10), dp(6), dp(10), dp(6))
        setOnClickListener { action() }
    }

    private fun toolDivider() = View(this).apply {
        setBackgroundColor(0x44FFFFFF)
        layoutParams = LinearLayout.LayoutParams(dp(1), dp(22)).also { it.setMargins(dp(2),0,dp(2),0) }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Result bar — Insert hidden when result is error/status message
    // ─────────────────────────────────────────────────────────────────────────

    private fun buildResultBar() {
        resultBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(C_RESULT_BG)
            layoutParams = LinearLayout.LayoutParams(MATCH, WRAP)
            setPadding(dp(12), dp(8), dp(8), dp(8))
            visibility = View.GONE
        }
        resultLabel = TextView(this).apply {
            textSize = 14f; setTextColor(C_KEY_TEXT)
            layoutParams = LinearLayout.LayoutParams(0, dp(42), 1f)
            maxLines = 2
            isVerticalScrollBarEnabled = true
            movementMethod = ScrollingMovementMethod.getInstance()
            setOnTouchListener { v, _ ->
                v.parent?.requestDisallowInterceptTouchEvent(true)
                false
            }
        }
        // Insert button — shown only when result is valid text
        resultInsertBtn = TextView(this).apply {
            text = "↙ Insert"; textSize = 13f
            setTextColor(C_PRIMARY); typeface = Typeface.DEFAULT_BOLD
            setPadding(dp(10), dp(4), dp(6), dp(4))
            visibility = View.GONE
            setOnClickListener { insertResult() }
        }
        // Dismiss: ✕ icon
        val dismiss = TextView(this).apply {
            text = "✕"; textSize = 18f
            setTextColor(Color.parseColor("#9E9E9E"))
            setPadding(dp(8), dp(2), dp(4), dp(2))
            setOnClickListener { hideResult() }
        }
        resultBar.addView(resultLabel)
        resultBar.addView(resultInsertBtn)
        resultBar.addView(dismiss)
        rootLayout.addView(resultBar)
    }

    private fun buildSnackbarOverlay() {
        snackbarLabel = TextView(this).apply {
            textSize = 13f
            setTextColor(Color.WHITE)
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            setPadding(dp(20), dp(10), dp(20), dp(10))
            background = roundRect(Color.parseColor("#323232"), dp(20))
            elevation = dp(6).toFloat()
            alpha = 0f
        }
        snackbarHost = FrameLayout(this).apply {
            isClickable = false
            isFocusable = false
            visibility = View.GONE
            setPadding(dp(24), 0, dp(24), dp(12))
            addView(
                snackbarLabel,
                FrameLayout.LayoutParams(WRAP, WRAP, Gravity.CENTER_HORIZONTAL),
            )
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Voice bar — mic icon + status + stop icon (■)
    // ─────────────────────────────────────────────────────────────────────────

    private fun buildVoiceBar() {
        voiceBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(theme.voiceBarBg)
            layoutParams = LinearLayout.LayoutParams(MATCH, dp(46))
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(12), 0, dp(12), 0)
            visibility = View.GONE
        }
        // Mic icon — flat vector, same style as toolbar icons
        val micIcon = ImageView(this).apply {
            setImageResource(R.drawable.ic_mic)
            setColorFilter(C_PRIMARY, PorterDuff.Mode.SRC_IN)
            scaleType = ImageView.ScaleType.CENTER_INSIDE
            layoutParams = LinearLayout.LayoutParams(dp(24), dp(24)).also { it.setMargins(0, 0, dp(8), 0) }
        }
        voiceLabel = TextView(this).apply {
            text = "Listening…"; textSize = 14f
            setTextColor(C_PRIMARY); typeface = Typeface.DEFAULT_BOLD
            layoutParams = LinearLayout.LayoutParams(0, WRAP, 1f)
        }
        // Stop icon: ■ (filled square = stop)
        val stopBtn = TextView(this).apply {
            text = "■"; textSize = 20f
            setTextColor(Color.parseColor("#E53935"))
            setPadding(dp(8), 0, 0, 0)
            setOnClickListener { stopVoice() }
        }
        voiceBar.addView(micIcon)
        voiceBar.addView(voiceLabel)
        voiceBar.addView(stopBtn)
        rootLayout.addView(voiceBar)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Voice command panel — record → transcribe → edit → execute
    // ─────────────────────────────────────────────────────────────────────────

    private fun buildVoiceCommandPanel() {
        voiceCommandUi = KeyboardVoiceCommandUi(
            this,
            object : KeyboardVoiceCommandUi.Callbacks {
                override fun onRecordingStop() = stopCommandRecording()
                override fun onRecordingCancel() = cancelVoiceCommandFlow()
                override fun onReviewCancel() = cancelVoiceCommandFlow()
                override fun onReviewSend(editedText: String) =
                    executeVoiceCommandFromReview(editedText)
            },
        )
        rootLayout.addView(voiceCommandUi!!.root)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Settings panel
    // ─────────────────────────────────────────────────────────────────────────

    private fun buildSettingsPanel() {
        settingsPanel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(theme.settingsBg)
            layoutParams = LinearLayout.LayoutParams(MATCH, WRAP)
            setPadding(dp(12), dp(8), dp(12), dp(8))
            visibility = View.GONE
        }
        renderSettingsPanel()
        rootLayout.addView(settingsPanel)
    }

    private fun renderSettingsPanel() {
        if (!::settingsPanel.isInitialized) return
        settingsPanel.removeAllViews()
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(MATCH, dp(44))
        }
        row.addView(TextView(this).apply {
            text = "Translation :"
            textSize = 14f
            setTextColor(C_HINT_TEXT)
            typeface = Typeface.DEFAULT_BOLD
            layoutParams = LinearLayout.LayoutParams(0, WRAP, 1f)
        })
        row.addView(languagePill(fromLang, true))
        row.addView(swapLanguageButton())
        row.addView(languagePill(toLang, false))
        settingsPanel.addView(row)
    }

    private fun languagePill(code: String, isFrom: Boolean): TextView {
        val name = languages.firstOrNull { it.first == code }?.second ?: code.uppercase()
        return TextView(this).apply {
            text = languageShort(code)
            textSize = 13f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            setTextColor(theme.pillText)
            background = roundRect(theme.pillBg, dp(18)).apply {
                setStroke(dp(1), theme.pillBorder)
            }
            contentDescription = name
            setPadding(dp(18), 0, dp(18), 0)
            layoutParams = LinearLayout.LayoutParams(dp(92), dp(34))
            setOnClickListener { showLanguagePopup(it, isFrom) }
        }
    }

    private fun swapLanguageButton(): TextView {
        return TextView(this).apply {
            text = "⇄"
            textSize = 18f
            gravity = Gravity.CENTER
            setTextColor(C_PRIMARY)
            background = roundRect(theme.pillBg, dp(17)).apply {
                setStroke(dp(1), theme.pillBorder)
            }
            layoutParams = LinearLayout.LayoutParams(dp(36), dp(34)).also {
                it.setMargins(dp(8), 0, dp(8), 0)
            }
            setOnClickListener {
                val nextFrom = toLang
                val nextTo = fromLang
                fromLang = nextFrom
                toLang = nextTo
                persistLanguages()
                renderSettingsPanel()
            }
        }
    }

    private fun showLanguagePopup(anchor: View, isFrom: Boolean) {
        languagePopupWindow?.dismiss()
        val list = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(theme.popupBg)
        }
        languages.forEach { (code, name) ->
            list.addView(LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(12), 0, dp(12), 0)
                layoutParams = LinearLayout.LayoutParams(MATCH, dp(44))
                addView(TextView(this@MyKeyboardService).apply {
                    text = name
                    textSize = 14f
                    setTextColor(theme.pillText)
                    layoutParams = LinearLayout.LayoutParams(0, WRAP, 1f)
                })
                addView(TextView(this@MyKeyboardService).apply {
                    text = languageShort(code).uppercase()
                    textSize = 11f
                    setTextColor(C_HINT_TEXT)
                    typeface = Typeface.DEFAULT_BOLD
                    gravity = Gravity.CENTER
                    layoutParams = LinearLayout.LayoutParams(dp(40), WRAP)
                })
                if ((isFrom && fromLang == code) || (!isFrom && toLang == code)) {
                    setBackgroundColor(theme.popupSelectedBg)
                }
                setOnClickListener {
                    if (isFrom) fromLang = code else toLang = code
                    persistLanguages()
                    languagePopupWindow?.dismiss()
                    renderSettingsPanel()
                }
            })
            list.addView(View(this).apply {
                setBackgroundColor(theme.suggestionDivider)
                layoutParams = LinearLayout.LayoutParams(MATCH, dp(1))
            })
        }
        val scroll = ScrollView(this).apply {
            addView(list)
            layoutParams = ViewGroup.LayoutParams(MATCH, dp(220))
        }
        languagePopupWindow = PopupWindow(scroll, dp(260), dp(220), false).apply {
            isFocusable = false
            isTouchable = true
            isOutsideTouchable = true
            inputMethodMode = PopupWindow.INPUT_METHOD_NOT_NEEDED
            setBackgroundDrawable(GradientDrawable().apply {
                setColor(theme.popupBg)
                cornerRadius = dp(6).toFloat()
                setStroke(dp(1), theme.popupStroke)
            })
            elevation = dp(6).toFloat()
            showAsDropDown(anchor, 0, dp(4))
        }
    }

    private fun persistLanguages() {
        prefs.edit()
            .putString(KeyboardModule.KEY_FROM_LANG, fromLang)
            .putString(KeyboardModule.KEY_TO_LANG, toLang)
            .apply()
    }

    private fun languageShort(code: String): String {
        return when (code.lowercase()) {
            "en" -> "EN"
            else -> code.lowercase().replaceFirstChar { it.uppercase() }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Keys
    // ─────────────────────────────────────────────────────────────────────────

    private fun buildKeys() {
        keysContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(MATCH, WRAP)
            setBackgroundColor(C_BG)
            setPadding(dp(4), dp(2), dp(4), dp(4))
        }
        rootLayout.addView(keysContainer)
        renderKeys()
    }

    private fun renderKeys() {
        keysContainer.removeAllViews()
        if (layer == Layer.EMOJI) return
        val rows = if (layer == Layer.SYMBOLS) symbolRows else alphaRows
        val isUpper = layer == Layer.SHIFT || layer == Layer.CAPS
        rows.forEachIndexed { rowIdx, keys ->
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                layoutParams = LinearLayout.LayoutParams(MATCH, dp(64))
                gravity = Gravity.CENTER
                setPadding(if (rowIdx == 1) dp(10) else dp(2), dp(2),
                           if (rowIdx == 1) dp(10) else dp(2), dp(2))
            }
            keys.forEach { logical ->
                val display = when {
                    isUpper && logical.length == 1 && logical[0].isLetter() -> logical.uppercase()
                    logical == "SHIFT" && layer == Layer.CAPS -> "⬆"   // filled = caps lock
                    logical == "SHIFT" -> "↑"                           // outline = shift
                    logical == "BKSP"  -> "⌫"
                    logical == "ENTER" -> "⏎"
                    logical == "EMOJI" -> "😊"
                    else -> logical
                }
                row.addView(makeKey(logical, display, rowIdx == 0))
            }
            keysContainer.addView(row)
        }
    }

    private fun makeKey(logical: String, display: String, isTopRow: Boolean): View {
        val isLetter  = logical.length == 1 && logical[0].isLetter()
        val isSpace   = logical == "space"
        val isAction  = logical in listOf("SHIFT","BKSP","?123","ABC","ENTER","EMOJI","/",",",".")
        val isShiftOn = logical == "SHIFT" && (layer == Layer.SHIFT || layer == Layer.CAPS)

        val bgColor = when {
            isShiftOn -> C_PRIMARY
            isSpace   -> C_KEY_LETTER
            isAction  -> C_KEY_ACTION
            else      -> C_KEY_LETTER
        }
        val weight = when {
            isSpace  -> 4f
            logical in listOf("SHIFT","BKSP","?123","ABC") -> 1.5f
            logical == "ENTER" -> 1.2f
            else -> 1f
        }

        val wrapper = FrameLayout(this).apply {
            layoutParams = LinearLayout.LayoutParams(0, MATCH, weight)
                .also { it.setMargins(dp(2), dp(2), dp(2), dp(2)) }
            minimumHeight = dp(48)
        }

        val keyElevation = if (keyboardIsDark) dp(1).toFloat() else dp(2).toFloat()
        val keyView: View = if (isTopRow && isLetter) {
            FrameLayout(this).apply {
                background = roundRect(bgColor, dp(8)); elevation = keyElevation
                layoutParams = FrameLayout.LayoutParams(MATCH, MATCH)
                addView(TextView(this@MyKeyboardService).apply {
                    text = display; textSize = 22f; gravity = Gravity.CENTER
                    setTextColor(C_KEY_TEXT)
                    layoutParams = FrameLayout.LayoutParams(MATCH, MATCH)
                })
                addView(TextView(this@MyKeyboardService).apply {
                    text = topRowHints[logical] ?: ""
                    textSize = 9f; setTextColor(C_HINT_TEXT)
                    layoutParams = FrameLayout.LayoutParams(WRAP, WRAP, Gravity.TOP or Gravity.END)
                        .also { it.setMargins(0, dp(3), dp(5), 0) }
                })
            }
        } else {
            TextView(this).apply {
                text = if (isSpace) "space" else display
                textSize = when {
                    isSpace -> 13f
                    logical in listOf("?123","ABC") -> 13f
                    logical == "EMOJI" -> 20f
                    logical in listOf("SHIFT","ENTER") -> 24f
                    logical in listOf("BKSP") -> 22f
                    else -> 22f
                }
                gravity = Gravity.CENTER
                setTextColor(if (isShiftOn) Color.WHITE else C_KEY_TEXT)
                background = roundRect(bgColor, dp(8)); elevation = keyElevation
                layoutParams = FrameLayout.LayoutParams(MATCH, MATCH)
            }
        }

        wrapper.addView(keyView)

        val previewLabel = when {
            isSpace -> "space"
            logical == "ENTER" -> "↵"
            else -> display
        }
        var suppressKeyOnUp = false
        var longPressTriggered = false
        var keyHandledOnDown = false
        val hasAltPopup = isLetter && keyAlternatives.containsKey(logical)
        val commitOnDown = !hasAltPopup && logical !in listOf("SHIFT", "BKSP", "ENTER", "EMOJI", "?123", "ABC")
        val longPressMs = if (hasAltPopup) ViewConfiguration.getLongPressTimeout().toLong() else 380L
        val longPressTask = Runnable {
            longPressTriggered = true
            suppressKeyOnUp = true
            keyHandledOnDown = true
            dismissKeyPreview(immediate = true)
            when {
                logical == "BKSP" -> clearAllInputText()
                hasAltPopup -> showAlternativesPopup(logical, wrapper)
            }
        }

        wrapper.setOnTouchListener { v, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    dismissAlternativesPopup()
                    suppressKeyOnUp = false
                    longPressTriggered = false
                    keyHandledOnDown = false
                    showKeyPreview(previewLabel, v)
                    mainHandler.removeCallbacks(longPressTask)
                    mainHandler.postDelayed(longPressTask, longPressMs)
                    if (commitOnDown) {
                        handleKey(logical)
                        keyHandledOnDown = true
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    mainHandler.removeCallbacks(longPressTask)
                    dismissKeyPreview()
                    if (!keyHandledOnDown && !suppressKeyOnUp && !longPressTriggered) {
                        handleKey(logical)
                    }
                    suppressKeyOnUp = false
                    longPressTriggered = false
                    keyHandledOnDown = false
                    true
                }
                MotionEvent.ACTION_CANCEL -> {
                    mainHandler.removeCallbacks(longPressTask)
                    dismissKeyPreview()
                    suppressKeyOnUp = false
                    longPressTriggered = false
                    keyHandledOnDown = false
                    true
                }
                else -> false
            }
        }
        return wrapper
    }

    private fun clearAllInputText() {
        if (voiceCommandUi?.clearTranscript() == true) return
        val ic = currentInputConnection ?: return
        ic.beginBatchEdit()
        ic.performContextMenuAction(android.R.id.selectAll)
        ic.commitText("", 1)
        ic.endBatchEdit()
        if (::suggestionRow.isInitialized) suggestionRow.removeAllViews()
        currentPartialWord = ""
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Long-press alternatives popup
    // ─────────────────────────────────────────────────────────────────────────

    private fun dismissAlternativesPopup() {
        popupWindow?.dismiss()
        popupWindow = null
    }

    private fun showAlternativesPopup(logical: String, anchor: View) {
        val alts = keyAlternatives[logical] ?: return
        if (!::rootLayout.isInitialized) return
        dismissAlternativesPopup()

        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            background = roundRect(theme.popupBg, dp(10)).also {
                it.setStroke(dp(1), theme.popupStroke)
            }
            setPadding(dp(4), dp(4), dp(4), dp(4))
            elevation = dp(8).toFloat()
        }

        alts.forEach { alt ->
            row.addView(TextView(this).apply {
                text = alt; textSize = 16f; gravity = Gravity.CENTER
                setTextColor(C_KEY_TEXT)
                background = roundRect(C_KEY_ACTION, dp(6))
                layoutParams = LinearLayout.LayoutParams(dp(38), dp(40))
                    .also { it.setMargins(dp(2), 0, dp(2), 0) }
                setOnClickListener {
                    if (voiceCommandUi?.insertTranscriptText(alt) != true) {
                        currentInputConnection?.commitText(alt, 1)
                    }
                    dismissAlternativesPopup()
                }
            })
        }

        val totalWidth = (alts.size * (dp(38) + dp(4))) + dp(8)
        val popupHeight = dp(52)
        // Non-focusable popup anchored to the keyboard — focusable popups steal IME focus and restart the keyboard.
        popupWindow = PopupWindow(row, totalWidth, popupHeight, false).apply {
            isFocusable = false
            isTouchable = true
            isOutsideTouchable = true
            isClippingEnabled = false
            inputMethodMode = PopupWindow.INPUT_METHOD_NOT_NEEDED
            setBackgroundDrawable(roundRect(theme.popupBg, dp(10)).also {
                it.setStroke(dp(1), theme.popupStroke)
            })
            elevation = dp(8).toFloat()
            setOnDismissListener { popupWindow = null }
        }

        val anchorLoc = IntArray(2)
        anchor.getLocationInWindow(anchorLoc)
        val rootLoc = IntArray(2)
        rootLayout.getLocationInWindow(rootLoc)
        var x = anchorLoc[0] - rootLoc[0] + (anchor.width - totalWidth) / 2
        val y = anchorLoc[1] - rootLoc[1] - popupHeight - dp(8)
        val maxX = (rootLayout.width - totalWidth).coerceAtLeast(0)
        x = x.coerceIn(0, maxX)
        popupWindow?.showAtLocation(rootLayout, Gravity.TOP or Gravity.START, x, y.coerceAtLeast(0))
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Emoji panel
    // ─────────────────────────────────────────────────────────────────────────

    private fun buildEmojiPanel() {
        emojiPanel = FrameLayout(this).apply {
            layoutParams = LinearLayout.LayoutParams(MATCH, dp(220))
            setBackgroundColor(C_BG); visibility = View.GONE
        }
        val outer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = FrameLayout.LayoutParams(MATCH, MATCH)
        }
        val tabBar = HorizontalScrollView(this).apply {
            layoutParams = LinearLayout.LayoutParams(MATCH, dp(40))
            setBackgroundColor(C_KEY_ACTION); isHorizontalScrollBarEnabled = false
        }
        val tabs = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            layoutParams = ViewGroup.LayoutParams(WRAP, MATCH)
        }
        val gridScroll = ScrollView(this).apply {
            layoutParams = LinearLayout.LayoutParams(MATCH, 0, 1f)
        }
        val grid = GridLayout(this).apply {
            columnCount = 8
            layoutParams = ViewGroup.LayoutParams(MATCH, WRAP)
            setPadding(dp(4), dp(4), dp(4), dp(4))
        }

        fun loadCategory(emojis: List<String>) {
            grid.removeAllViews()
            emojis.forEach { emoji ->
                grid.addView(TextView(this).apply {
                    text = emoji; textSize = 22f; gravity = Gravity.CENTER
                    layoutParams = GridLayout.LayoutParams().apply {
                        width = dp(40); height = dp(40)
                        setMargins(dp(2), dp(2), dp(2), dp(2))
                    }
                    setOnClickListener {
                        if (voiceCommandUi?.insertTranscriptText(emoji) != true) {
                            currentInputConnection?.commitText(emoji, 1)
                        }
                    }
                })
            }
        }

        emojiCategories.forEachIndexed { idx, (icon, emojis) ->
            tabs.addView(TextView(this).apply {
                text = icon; textSize = 20f; gravity = Gravity.CENTER
                layoutParams = LinearLayout.LayoutParams(dp(44), MATCH)
                setOnClickListener {
                    loadCategory(emojis)
                    for (i in 0 until tabs.childCount) {
                        val t = tabs.getChildAt(i) as? TextView ?: continue
                        t.setBackgroundColor(if (i == idx) C_PRIMARY else Color.TRANSPARENT)
                    }
                }
            })
        }
        loadCategory(emojiCategories[0].second)
        (tabs.getChildAt(0) as? TextView)?.setBackgroundColor(C_PRIMARY)

        val backRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(C_KEY_ACTION)
            layoutParams = LinearLayout.LayoutParams(MATCH, dp(40))
            gravity = Gravity.CENTER_VERTICAL; setPadding(dp(8), 0, dp(8), 0)
        }
        backRow.addView(TextView(this).apply {
            text = "⌨  Keyboard"; textSize = 13f
            setTextColor(C_KEY_TEXT); typeface = Typeface.DEFAULT_BOLD
            setOnClickListener { setLayer(Layer.ALPHA) }
        })
        backRow.addView(View(this).apply { layoutParams = LinearLayout.LayoutParams(0,1,1f) })
        backRow.addView(TextView(this).apply {
            text = "⌫"; textSize = 18f; setTextColor(C_KEY_TEXT)
            setOnClickListener {
                if (voiceCommandUi?.routeKey("BKSP", shiftOn = false, capsOn = false) != true) {
                    currentInputConnection?.deleteSurroundingText(1, 0)
                }
            }
        })

        tabBar.addView(tabs); gridScroll.addView(grid)
        outer.addView(tabBar); outer.addView(gridScroll); outer.addView(backRow)
        emojiPanel.addView(outer)
        rootLayout.addView(emojiPanel)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Key handling
    // ─────────────────────────────────────────────────────────────────────────

    private fun handleKey(logical: String) {
        val shiftOn = layer == Layer.SHIFT
        val capsOn = layer == Layer.CAPS
        if (voiceCommandUi?.routeKey(logical, shiftOn, capsOn) == true) {
            if (shiftOn && logical.length == 1 && logical !in listOf("BKSP", "space", "ENTER")) {
                setLayer(Layer.ALPHA)
            }
            return
        }

        val ic = currentInputConnection ?: return
        when {
            logical == "space" -> {
                recordCompletedWordFromContext()
                ic.commitText(" ", 1)
                if (layer == Layer.SHIFT) setLayer(Layer.ALPHA)
                updateSuggestions()
            }
            logical == "BKSP" -> {
                val sel = ic.getSelectedText(0)
                if (!TextUtils.isEmpty(sel)) ic.commitText("", 1)
                else ic.deleteSurroundingText(1, 0)
                if (editorSupportsFirstCharCap && !userDeclinedFirstCharCap) {
                    pendingFirstCharCapitalize = isInputEmptyForFirstCharCap()
                    if (pendingFirstCharCapitalize) applyInitialShiftForEmptyField()
                }
                updateSuggestions()
            }
            logical == "ENTER" -> {
                recordCompletedWordFromContext()
                ic.sendKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ENTER))
                ic.sendKeyEvent(KeyEvent(KeyEvent.ACTION_UP,   KeyEvent.KEYCODE_ENTER))
            }
            logical == "SHIFT" -> {
                val before = layer
                setLayer(
                    when (layer) {
                        Layer.ALPHA -> Layer.SHIFT
                        Layer.SHIFT -> Layer.CAPS
                        Layer.CAPS -> Layer.ALPHA
                        else -> Layer.ALPHA
                    },
                )
                onManualShiftLayerChange(before, layer)
            }
            logical == "," -> {
                recordCompletedWordFromContext()
                ic.commitText(",", 1)
                updateSuggestions()
            }
            logical == "." -> {
                recordCompletedWordFromContext()
                ic.commitText(".", 1)
                updateSuggestions()
            }
            logical == "SHIFT" -> setLayer(when (layer) {
                Layer.ALPHA -> Layer.SHIFT
                Layer.SHIFT -> Layer.CAPS
                Layer.CAPS  -> Layer.ALPHA
                else        -> Layer.ALPHA
            })
            logical == "?123"  -> setLayer(Layer.SYMBOLS)
            logical == "ABC"   -> setLayer(Layer.ALPHA)
            logical == "EMOJI" -> setLayer(Layer.EMOJI)
            else -> {
                val shiftOn = layer == Layer.SHIFT
                val capsOn = layer == Layer.CAPS
                var out = if (shiftOn || capsOn) logical.uppercase() else logical
                if (logical.length == 1 && logical[0].isLetter()) {
                    val applyAutoFirstCap = pendingFirstCharCapitalize &&
                        editorSupportsFirstCharCap &&
                        !userDeclinedFirstCharCap &&
                        (layer == Layer.SHIFT || layer == Layer.CAPS)
                    if (applyAutoFirstCap) {
                        out = out.uppercase()
                        if (layer == Layer.SHIFT) setLayer(Layer.ALPHA)
                    }
                    if (pendingFirstCharCapitalize) {
                        pendingFirstCharCapitalize = false
                    }
                }
                ic.commitText(out, 1)
                if (layer == Layer.SHIFT && logical !in listOf("BKSP", "space", "ENTER") &&
                    logical.length == 1 && !pendingFirstCharCapitalize
                ) {
                    setLayer(Layer.ALPHA)
                }
                updateSuggestions()
            }
        }
    }

    private fun setLayer(l: Layer) {
        layer = l
        if (l != Layer.EMOJI) {
            showClipboardSession = false
        }
        renderKeys()
        updateKeyboardPanelsVisibility()
    }

    private fun toggleSettings() {
        showSettings = !showSettings
        settingsPanel.visibility = if (showSettings) View.VISIBLE else View.GONE
    }

    private fun shouldOfferFirstCharCapitalize(info: EditorInfo?): Boolean {
        if (info == null) return false
        val variation = info.inputType and android.text.InputType.TYPE_MASK_VARIATION
        if (
            variation == android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD ||
            variation == android.text.InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD ||
            variation == android.text.InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD
        ) {
            return false
        }
        val typeClass = info.inputType and android.text.InputType.TYPE_MASK_CLASS
        if (typeClass != android.text.InputType.TYPE_CLASS_TEXT) return false
        return (info.inputType and android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES) != 0
    }

    private fun applyInitialShiftForEmptyField() {
        if (!editorSupportsFirstCharCap || !pendingFirstCharCapitalize || userDeclinedFirstCharCap) return
        if (!isInputEmptyForFirstCharCap()) return
        if (showClipboardSession || layer == Layer.EMOJI || layer == Layer.SYMBOLS) return
        if (layer == Layer.ALPHA) setLayer(Layer.SHIFT)
    }

    /** Sync auto-capitalize state when the user toggles Shift (UI and behavior must match). */
    private fun onManualShiftLayerChange(before: Layer, after: Layer) {
        if (!editorSupportsFirstCharCap) return
        if (after == Layer.ALPHA && before != Layer.ALPHA) {
            userDeclinedFirstCharCap = true
            pendingFirstCharCapitalize = false
            return
        }
        if (
            (after == Layer.SHIFT || after == Layer.CAPS) &&
            before == Layer.ALPHA &&
            userDeclinedFirstCharCap &&
            isInputEmptyForFirstCharCap()
        ) {
            userDeclinedFirstCharCap = false
            pendingFirstCharCapitalize = true
        }
    }

    private fun isInputEmptyForFirstCharCap(): Boolean {
        val ic = currentInputConnection ?: return true
        val before = ic.getTextBeforeCursor(512, 0)?.toString().orEmpty()
        return before.isEmpty()
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Word suggestions
    // ─────────────────────────────────────────────────────────────────────────

    private fun getCurrentPartialWord(): String? {
        val ic = currentInputConnection ?: return null
        val before = ic.getTextBeforeCursor(40, 0)?.toString() ?: return null
        val match = Regex("[A-Za-z']+$").find(before) ?: return null
        return match.value
    }

    private fun updateSuggestions() {
        if (!::suggestionRow.isInitialized) return
        val partial = getCurrentPartialWord()?.lowercase().orEmpty()
        if (partial.isEmpty()) {
            currentPartialWord = ""
            renderSuggestionChips(emptyList(), loading = false)
            return
        }
        scheduleDatamuseFetch(partial)
    }

    private fun scheduleDatamuseFetch(query: String) {
        suggestionDebounce?.let { mainHandler.removeCallbacks(it) }
        if (query.length < 1) {
            currentPartialWord = ""
            renderSuggestionChips(emptyList(), loading = false)
            return
        }
        renderSuggestionChips(emptyList(), loading = true)
        val seq = ++suggestionsRequestSeq
        val task = Runnable { fetchDatamuseSuggestions(query, seq) }
        suggestionDebounce = task
        mainHandler.postDelayed(task, 280)
    }

    private fun fetchDatamuseSuggestions(query: String, seq: Long) {
        datamuseExecutor.execute {
            val local = KeyboardSuggestionLexicon.suggestions(query, 8)
            val recent = KeyboardRecentWords.suggestions(this@MyKeyboardService, query, 8)
            val remote = try {
                val encoded = URLEncoder.encode(query, "UTF-8")
                val merged = ArrayList<String>()
                merged.addAll(fetchDatamuseUrl("https://api.datamuse.com/sug?s=$encoded&max=8"))
                merged.addAll(fetchDatamuseUrl("https://api.datamuse.com/words?sp=$encoded*&max=8"))
                merged.addAll(fetchDatamuseUrl("https://api.datamuse.com/words?sp=$encoded&max=8"))
                merged
            } catch (e: Exception) {
                android.util.Log.w("TypeEasyKB", "Datamuse: ${e.message}")
                emptyList()
            }
            val words = mergeSuggestionWords(recent, local, remote, query, 8)
            mainHandler.post {
                if (seq != suggestionsRequestSeq) return@post
                currentPartialWord = query
                isFetchingSuggestions = false
                renderSuggestionChips(words, loading = false)
            }
        }
    }

    private fun fetchDatamuseUrl(urlString: String): List<String> {
        val conn = URL(urlString).openConnection() as HttpURLConnection
        conn.requestMethod = "GET"
        conn.connectTimeout = 8_000
        conn.readTimeout = 8_000
        conn.setRequestProperty("Accept", "application/json")
        val body = if (conn.responseCode in 200..299) {
            conn.inputStream.bufferedReader(Charsets.UTF_8).readText()
        } else {
            ""
        }
        conn.disconnect()
        return parseDatamuseWords(body)
    }

    private fun mergeSuggestionWords(
        recent: List<String>,
        local: List<String>,
        remote: List<String>,
        query: String,
        max: Int,
    ): List<String> {
        val q = query.lowercase()
        val seen = LinkedHashSet<String>()
        val out = ArrayList<String>(max)
        fun push(word: String) {
            val key = word.trim().lowercase()
            if (key.isEmpty() || !seen.add(key)) return
            out.add(word)
        }
        recent.forEach { push(it) }
        local.forEach { push(it) }
        remote.sortedWith(compareBy { rankSuggestionWord(it, q) }).forEach { push(it) }
        return out.take(max)
    }

    private fun recordCompletedWordFromContext() {
        val word = getCurrentPartialWord() ?: return
        if (word.length < 2) return
        KeyboardRecentWords.record(this, word)
    }

    private fun rankSuggestionWord(word: String, query: String): Int {
        val w = word.lowercase()
        return when {
            w.startsWith(query) -> 0
            w.contains(query) -> 1
            else -> 2
        }
    }

    private fun parseDatamuseWords(json: String): List<String> {
        if (json.isBlank()) return emptyList()
        val arr = JSONArray(json)
        val out = ArrayList<String>(arr.length())
        for (i in 0 until arr.length()) {
            val word = arr.optJSONObject(i)?.optString("word", "")?.trim().orEmpty()
            if (word.isNotEmpty()) out.add(word)
        }
        return out
    }

    private fun renderSuggestionChips(words: List<String>, loading: Boolean) {
        if (!::suggestionRow.isInitialized) return
        suggestionRow.removeAllViews()
        if (loading) {
            suggestionRow.addView(TextView(this).apply {
                text = "…"
                textSize = 15f
                setTextColor(C_HINT_TEXT)
                gravity = Gravity.CENTER_VERTICAL
            })
            return
        }
        if (words.isEmpty()) return
        val partialLen = currentPartialWord.length
        words.forEachIndexed { index, word ->
            if (index > 0) {
                suggestionRow.addView(TextView(this).apply {
                    text = "·"
                    textSize = 15f
                    setTextColor(C_HINT_TEXT)
                    setPadding(dp(10), 0, dp(10), 0)
                    gravity = Gravity.CENTER_VERTICAL
                })
            }
            suggestionRow.addView(TextView(this).apply {
                text = word
                textSize = 15f
                setTextColor(if (index == 0) C_PRIMARY else C_KEY_TEXT)
                typeface = if (index == 0) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(4), dp(2), dp(4), dp(2))
                setOnClickListener { applySuggestionWord(word, partialLen) }
            })
        }
    }

    private fun showKeyPreview(label: String, anchor: View) {
        keyPreviewDismissRunnable?.let { mainHandler.removeCallbacks(it) }
        keyPreviewDismissRunnable = null
        keyPreviewPopup?.dismiss()
        val bubble = TextView(this).apply {
            text = label
            textSize = 26f
            setTextColor(C_KEY_TEXT)
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            minWidth = dp(52)
            minHeight = dp(52)
            setPadding(dp(14), dp(10), dp(14), dp(10))
            background = roundRect(C_KEY_LETTER, dp(10)).apply {
                setStroke(dp(1), theme.popupStroke)
            }
            elevation = dp(8).toFloat()
        }
        bubble.measure(
            View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
            View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
        )
        val bubbleH = bubble.measuredHeight
        val anchorH = if (anchor.height > 0) anchor.height else dp(48)
        val yOffset = -(anchorH + bubbleH + dp(10))

        keyPreviewPopup = PopupWindow(bubble, WRAP, WRAP, false).apply {
            isClippingEnabled = false
            elevation = dp(12).toFloat()
            showAsDropDown(anchor, 0, yOffset)
        }
        keyPreviewShownAt = System.currentTimeMillis()
    }

    private fun dismissKeyPreview(immediate: Boolean = false) {
        keyPreviewDismissRunnable?.let { mainHandler.removeCallbacks(it) }
        keyPreviewDismissRunnable = null
        if (keyPreviewPopup == null) return

        if (immediate) {
            keyPreviewPopup?.dismiss()
            keyPreviewPopup = null
            keyPreviewShownAt = 0L
            return
        }

        val elapsed = System.currentTimeMillis() - keyPreviewShownAt
        val remaining = keyPreviewMinVisibleMs - elapsed
        if (remaining <= 0) {
            keyPreviewPopup?.dismiss()
            keyPreviewPopup = null
            keyPreviewShownAt = 0L
            return
        }

        val task = Runnable {
            keyPreviewPopup?.dismiss()
            keyPreviewPopup = null
            keyPreviewShownAt = 0L
            keyPreviewDismissRunnable = null
        }
        keyPreviewDismissRunnable = task
        mainHandler.postDelayed(task, remaining)
    }

    private fun applySuggestionWord(word: String, partialLen: Int) {
        val ic = currentInputConnection ?: return
        if (partialLen > 0) ic.deleteSurroundingText(partialLen, 0)
        ic.commitText("$word ", 1)
        KeyboardRecentWords.record(this, word)
        currentPartialWord = ""
        suggestionsRequestSeq++
        renderSuggestionChips(emptyList(), loading = false)
    }

    private fun resolveKeyboardIsDark(): Boolean {
        if (!::prefs.isInitialized) return keyboardIsDark
        return when (prefs.getString(KeyboardModule.KEY_THEME_MODE, "system")?.lowercase()) {
            "dark" -> true
            "light" -> false
            else -> {
                val night = resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
                night == Configuration.UI_MODE_NIGHT_YES
            }
        }
    }

    private fun applyThemeToViews() {
        theme = KeyboardTheme.fromIsDark(keyboardIsDark)
        if (!::rootLayout.isInitialized) return
        rootLayout.setBackgroundColor(C_BG)
        if (::clipboardBar.isInitialized) {
            clipboardBar.setBackgroundColor(Color.TRANSPARENT)
            (clipboardBar.getChildAt(0) as? TextView)?.setTextColor(C_HINT_TEXT)
            clipboardPreview.setTextColor(C_KEY_TEXT)
        }
        if (::clipboardSessionPanel.isInitialized) {
            clipboardSessionPanel.setBackgroundColor(C_BG)
            clipboardBackBtn.setColorFilter(C_KEY_TEXT, PorterDuff.Mode.SRC_IN)
            clipboardDeleteBtn.setColorFilter(C_KEY_TEXT, PorterDuff.Mode.SRC_IN)
            clipboardPinBtn.setColorFilter(C_KEY_TEXT, PorterDuff.Mode.SRC_IN)
            clipboardTitleView.setTextColor(C_KEY_TEXT)
            clipboardSelectAllBtn.setTextColor(C_KEY_TEXT)
            if (showClipboardSession) {
                updateClipboardHeaderForSelection()
                renderClipboardSession()
            }
        }
        if (::suggestionScroll.isInitialized) suggestionScroll.setBackgroundColor(C_SUGGESTION)
        if (::suggestionToolbarDivider.isInitialized) {
            suggestionToolbarDivider.setBackgroundColor(theme.suggestionDivider)
        }
        if (::featureToolbar.isInitialized) featureToolbar.setBackgroundColor(C_TOOLBAR_BG)
        if (::keysContainer.isInitialized) {
            keysContainer.setBackgroundColor(C_BG)
            renderKeys()
        }
        if (::resultBar.isInitialized) resultBar.setBackgroundColor(C_RESULT_BG)
        if (::voiceBar.isInitialized) voiceBar.setBackgroundColor(theme.voiceBarBg)
        voiceCommandUi?.applyTheme(theme)
        if (::settingsPanel.isInitialized) {
            settingsPanel.setBackgroundColor(theme.settingsBg)
            if (showSettings) renderSettingsPanel()
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Feature: Translate
    // ─────────────────────────────────────────────────────────────────────────

    private fun onTranslatePress() {
        refreshKeyboardConfig()
        val ic = currentInputConnection ?: return
        val selected = ic.getSelectedText(0)?.toString()
        val beforeCursor = ic.getTextBeforeCursor(500, 0)?.toString()
        val text = if (!selected.isNullOrBlank()) selected else beforeCursor?.trim()
        if (text.isNullOrBlank()) {
            showResult("Type or select text first.", isError = true)
            return
        }
        val useInternal = FloatingMicConfigStore.isInternalFloatingTranslationEnabled(this)
        if (!useInternal && !hasUserId()) {
            showResult("Open Type Easy and log in before using Translate.", isError = true)
            return
        }
        showResult("Translating…", isError = false, isLoading = true)
        rememberReplacementTarget(selected, beforeCursor)
        executor.execute {
            if (useInternal) {
                val tr = MlKitTranslateHelper.translate(this, text, fromLang, toLang)
                mainHandler.post {
                    tr.onSuccess { showResult(it, isError = false) }
                        .onFailure { e ->
                            showResult(
                                VoiceCommandErrorMapper.toUserMessage(e.message ?: "Translation failed"),
                                isError = true,
                            )
                        }
                }
            } else {
                val result = callApi(
                    ApiConfig.typeEasyUrl(ApiConfig.Endpoints.TRANSLATE),
                    "user_id" to userId,
                    "text" to text,
                    "target_language" to toLang,
                )
                val out = extractApiText(result, "translated_text", "translation", "result", "data")
                val error = extractApiText(result, "error", "message", "detail")
                mainHandler.post {
                    if (!out.isNullOrBlank()) {
                        showResult(out, isError = false)
                    } else {
                        showResult(error ?: "Translation failed", isError = true)
                    }
                }
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Feature: Grammar Check
    // ─────────────────────────────────────────────────────────────────────────

    private fun onGrammarPress() {
        refreshKeyboardConfig()
        val ic = currentInputConnection ?: return
        val selected = ic.getSelectedText(0)?.toString()
        val beforeCursor = ic.getTextBeforeCursor(500, 0)?.toString()
        val text = if (!selected.isNullOrBlank()) selected else beforeCursor?.trim()
        if (text.isNullOrBlank()) {
            showResult("Type or select text first.", isError = true)
            return
        }
        if (!hasUserId()) {
            showResult("Open Type Easy and log in before using Grammar.", isError = true)
            return
        }
        showResult("Checking grammar…", isError = false, isLoading = true)
        rememberReplacementTarget(selected, beforeCursor)
        executor.execute {
            val result = callApi(
                ApiConfig.typeEasyUrl(ApiConfig.Endpoints.GRAMMAR_CHECK),
                "user_id" to userId,
                "text" to text,
                "fast" to "false"
            )
            val out = extractApiText(result, "corrected_text", "corrected", "result", "data")
            val error = extractApiText(result, "error", "message", "detail")
            mainHandler.post {
                if (!out.isNullOrBlank()) {
                    showResult(out, isError = false)
                } else {
                    showResult(error ?: "Grammar check failed", isError = true)
                }
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Feature: Voice Input
    // ─────────────────────────────────────────────────────────────────────────

    private fun onVoicePress() {
        if (FloatingMicConfigStore.isInternalTranscribeEnabled(this)) {
            startInternalVoiceInput()
        } else {
            if (isCloudDictationRecording) {
                stopCloudDictationAndUpload()
            } else {
                startCloudDictation()
            }
        }
    }

    private fun startInternalVoiceInput() {
        if (isListening) { stopVoice(); return }
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            showResult("Speech recognition not available.", isError = true)
            return
        }
        speechRecognizer?.destroy()
        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this)
        speechRecognizer?.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(p: Bundle?) {
                isListening = true
                mainHandler.post {
                    voiceBar.visibility = View.VISIBLE
                    voiceLabel.text = "Listening…"
                }
            }
            override fun onEndOfSpeech() {
                mainHandler.post { voiceLabel.text = "Processing…" }
            }
            override fun onError(error: Int) {
                isListening = false
                mainHandler.post {
                    voiceBar.visibility = View.GONE
                    val msg = when (error) {
                        SpeechRecognizer.ERROR_NO_MATCH       -> "No speech detected."
                        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "Timed out. Try again."
                        SpeechRecognizer.ERROR_NETWORK        -> "Network error."
                        else -> "Voice error ($error)."
                    }
                    showResult(msg, isError = true)
                }
            }
            override fun onResults(results: Bundle?) {
                isListening = false
                mainHandler.post { voiceBar.visibility = View.GONE }
                val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
                if (!text.isNullOrBlank()) {
                    mainHandler.post {
                        currentInputConnection?.commitText("$text ", 1)
                        updateSuggestions()
                    }
                } else {
                    mainHandler.post { showResult("No speech detected.", isError = true) }
                }
            }
            override fun onPartialResults(p: Bundle?) {
                val partial = p?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
                if (!partial.isNullOrBlank()) mainHandler.post { voiceLabel.text = partial }
            }
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(v: Float) {}
            override fun onBufferReceived(b: ByteArray?) {}
            override fun onEvent(t: Int, p: Bundle?) {}
        })
        speechRecognizer?.startListening(
            Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault())
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            }
        )
    }

    private fun startCloudDictation() {
        stopVoice()
        if (!hasRecordAudioPermission()) {
            showResult("Allow microphone access in Type Easy settings.", isError = true)
            return
        }
        val baseUrl = FloatingMicConfigStore.getVoiceTranscribeBaseUrl(this)
        val useElevenLabs = FloatingMicConfigStore.shouldUseElevenLabsForMicTranscribe(this)
        if (baseUrl.isBlank() && !useElevenLabs) {
            showResult("Voice service is not set up. Open Type Easy → Settings.", isError = true)
            return
        }
        try {
            dictationAudioFile = File(cacheDir, "keyboard_dictation_${System.currentTimeMillis()}.m4a")
            val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(this)
            } else {
                @Suppress("DEPRECATION")
                MediaRecorder()
            }
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC)
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            recorder.setOutputFile(dictationAudioFile!!.absolutePath)
            recorder.prepare()
            recorder.start()
            dictationMediaRecorder = recorder
            isCloudDictationRecording = true
            voiceBar.visibility = View.VISIBLE
            voiceLabel.text = "Recording… tap mic to stop"
        } catch (e: Exception) {
            releaseDictationRecorder()
            dictationAudioFile?.delete()
            dictationAudioFile = null
            showResult(
                VoiceCommandErrorMapper.toUserMessage(e.message ?: "Recording failed"),
                isError = true,
            )
        }
    }

    private fun stopCloudDictationAndUpload() {
        val file = dictationAudioFile
        try {
            dictationMediaRecorder?.stop()
        } catch (_: Exception) {
        }
        releaseDictationRecorder()
        isCloudDictationRecording = false
        voiceBar.visibility = View.GONE
        voiceLabel.text = "Processing…"

        if (file == null || !file.exists() || file.length() == 0L) {
            file?.delete()
            dictationAudioFile = null
            showResult("Recording file empty", isError = true)
            return
        }

        showResult("Transcribing…", isError = false, isLoading = true)
        val baseUrl = FloatingMicConfigStore.getVoiceTranscribeBaseUrl(this)
        executor.execute {
            val result = if (FloatingMicConfigStore.shouldUseElevenLabsForMicTranscribe(this)) {
                val eleven = ElevenLabsTranscribeClient.transcribeFile(
                    FloatingMicConfigStore.getElevenLabsApiKey(this),
                    file,
                    FloatingMicConfigStore.getTranslateSourceLang(this)
                        .trim()
                        .takeIf { it.isNotEmpty() && it.lowercase() != "auto" }
                        ?.substringBefore('-'),
                )
                if (eleven.isFailure && baseUrl.isNotBlank()) {
                    VoiceTranscribeClient.transcribeFile(baseUrl, file)
                } else {
                    eleven
                }
            } else {
                VoiceTranscribeClient.transcribeFile(baseUrl, file)
            }
            mainHandler.post {
                runCatching { file.delete() }
                dictationAudioFile = null
                hideResult()
                val text = result.getOrNull()
                if (!text.isNullOrBlank()) {
                    currentInputConnection?.commitText("$text ", 1)
                    updateSuggestions()
                } else {
                    showResult(
                        VoiceCommandErrorMapper.toUserMessage(
                            result.exceptionOrNull()?.message ?: "Transcription failed",
                        ),
                        isError = true,
                    )
                }
            }
        }
    }

    private fun releaseDictationRecorder() {
        try {
            dictationMediaRecorder?.reset()
            dictationMediaRecorder?.release()
        } catch (_: Exception) {
        }
        dictationMediaRecorder = null
        isCloudDictationRecording = false
    }

    private fun stopVoice() {
        if (isCloudDictationRecording) {
            stopCloudDictationAndUpload()
            return
        }
        speechRecognizer?.stopListening()
        speechRecognizer?.destroy()
        speechRecognizer = null
        isListening = false
        if (::voiceBar.isInitialized) voiceBar.visibility = View.GONE
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Feature: Voice Command
    // ─────────────────────────────────────────────────────────────────────────

    private fun onVoiceCommandPress() {
        refreshKeyboardConfig()
        val ui = voiceCommandUi ?: return
        if (ui.isActive) {
            if (ui.isRecording) stopCommandRecording() else cancelVoiceCommandFlow()
            return
        }
        stopVoice()
        hideResult()
        if (!hasRecordAudioPermission()) {
            showResult("Allow microphone access in Type Easy settings.", isError = true)
            return
        }
        val baseUrl = FloatingMicConfigStore.getVoiceTranscribeBaseUrl(this)
        if (baseUrl.isBlank()) {
            showResult("Voice service is not set up. Open Type Easy → Settings.", isError = true)
            return
        }
        if (!hasUserId()) {
            showResult("Open Type Easy and log in before using Voice Command.", isError = true)
            return
        }
        startCommandRecording()
    }

    private fun hasRecordAudioPermission(): Boolean =
        ContextCompat.checkSelfPermission(this, android.Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED

    private fun startCommandRecording() {
        if (commandMediaRecorder != null) return
        try {
            commandAudioFile = File(cacheDir, "keyboard_cmd_${System.currentTimeMillis()}.m4a")
            val outPath = commandAudioFile!!.absolutePath
            val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(this)
            } else {
                @Suppress("DEPRECATION")
                MediaRecorder()
            }
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC)
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            recorder.setOutputFile(outPath)
            recorder.prepare()
            recorder.start()
            commandMediaRecorder = recorder
            commandRecordingStartedAt = System.currentTimeMillis()
            voiceCommandUi?.showRecording()
            startCommandTimer()
        } catch (e: Exception) {
            releaseCommandRecorder()
            commandAudioFile?.delete()
            commandAudioFile = null
            showResult(
                VoiceCommandErrorMapper.toUserMessage(e.message ?: "Recording failed"),
                isError = true,
            )
        }
    }

    private fun stopCommandRecording() {
        stopCommandTimer()
        val file = commandAudioFile
        try {
            commandMediaRecorder?.stop()
        } catch (_: Exception) {
        }
        releaseCommandRecorder()
        if (file == null || !file.exists() || file.length() == 0L) {
            file?.delete()
            commandAudioFile = null
            voiceCommandUi?.showReviewError("Recording file empty")
            return
        }
        val baseUrl = FloatingMicConfigStore.getVoiceTranscribeBaseUrl(this)
        voiceCommandUi?.showReviewLoading("Transcribing your recording…")
        executor.execute {
            val result = VoiceTranscribeClient.transcribeFileFull(baseUrl, file)
            mainHandler.post {
                runCatching { file.delete() }
                commandAudioFile = null
                if (result.isSuccess) {
                    val tr = result.getOrNull()!!
                    commandVoiceAssetId = tr.voiceAssetId
                    commandOriginalTranscript = tr.transcript
                    voiceCommandUi?.showReview(tr.transcript)
                } else {
                    val msg = result.exceptionOrNull()?.message ?: "Transcription failed"
                    voiceCommandUi?.showReviewError(msg)
                }
            }
        }
    }

    private fun executeVoiceCommandFromReview(editedText: String) {
        val baseUrl = FloatingMicConfigStore.getVoiceTranscribeBaseUrl(this)
        voiceCommandUi?.setLoading(true, "Sending command…")
        executor.execute {
            var assetId = commandVoiceAssetId
            if (assetId.isNullOrBlank()) {
                mainHandler.post {
                    voiceCommandUi?.showReviewError("Missing voice asset ID — re-record and try again.")
                }
                return@execute
            }
            if (editedText != commandOriginalTranscript) {
                val updateResult = VoiceCommandClient.updateTranscript(baseUrl, assetId, editedText)
                updateResult.onSuccess { assetId = it }
                if (updateResult.isFailure) {
                    mainHandler.post {
                        voiceCommandUi?.showReviewError(
                            updateResult.exceptionOrNull()?.message ?: "Failed to update transcript",
                        )
                    }
                    return@execute
                }
            }
            val execResult = VoiceCommandClient.executeVoiceCommand(baseUrl, assetId!!)
            mainHandler.post {
                if (execResult.isSuccess) {
                    completeVoiceCommandSuccess(execResult.getOrNull())
                } else {
                    voiceCommandUi?.showReviewError(
                        execResult.exceptionOrNull()?.message ?: "Execution failed",
                    )
                }
            }
        }
    }

    private fun completeVoiceCommandSuccess(payload: VoiceCommandClient.ExecuteResult?) {
        stopCommandTimer()
        releaseCommandRecorder()
        runCatching { commandAudioFile?.delete() }
        commandAudioFile = null
        commandVoiceAssetId = null
        commandOriginalTranscript = ""

        dismissVoiceCommandPanel()
        showSnackbar(voiceCommandSuccessMessage(payload))
        refreshClipboardSuggestion()

        if (::rootLayout.isInitialized) {
            rootLayout.post {
                dismissVoiceCommandPanel()
                refreshClipboardSuggestion()
            }
        }
    }

    private fun dismissVoiceCommandPanel() {
        voiceCommandUi?.dismiss()
        if (!::rootLayout.isInitialized) return
        for (i in 0 until rootLayout.childCount) {
            val child = rootLayout.getChildAt(i)
            if (child.tag == "voice_command_panel") {
                child.visibility = View.GONE
            }
        }
        rootLayout.requestLayout()
        refreshClipboardSuggestion()
    }

    private fun cancelVoiceCommandFlow() {
        stopCommandTimer()
        try {
            commandMediaRecorder?.stop()
        } catch (_: Exception) {
        }
        releaseCommandRecorder()
        runCatching { commandAudioFile?.delete() }
        commandAudioFile = null
        commandVoiceAssetId = null
        commandOriginalTranscript = ""
        dismissVoiceCommandPanel()
    }

    private fun releaseCommandRecorder() {
        try {
            commandMediaRecorder?.reset()
            commandMediaRecorder?.release()
        } catch (_: Exception) {
        }
        commandMediaRecorder = null
    }

    private fun startCommandTimer() {
        stopCommandTimer()
        commandTimerRunnable = object : Runnable {
            override fun run() {
                val elapsed = System.currentTimeMillis() - commandRecordingStartedAt
                voiceCommandUi?.updateRecordingTimer(formatCommandElapsed(elapsed))
                mainHandler.postDelayed(this, 500L)
            }
        }
        mainHandler.post(commandTimerRunnable!!)
    }

    private fun stopCommandTimer() {
        commandTimerRunnable?.let { mainHandler.removeCallbacks(it) }
        commandTimerRunnable = null
    }

    private fun formatCommandElapsed(ms: Long): String {
        val totalSec = (ms / 1000).coerceAtLeast(0)
        val min = totalSec / 60
        val sec = totalSec % 60
        return String.format("%d:%02d", min, sec)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // API helper — multipart/form-data POST
    // URLs come from ApiConfig (mirrors src/config/api.js)
    // ─────────────────────────────────────────────────────────────────────────

    private fun callApi(endpoint: String, vararg fields: Pair<String, String>): JSONObject {
        return try {
            // Use a random boundary so it never collides with field values
            val boundary = "TypeEasyBoundary${System.currentTimeMillis()}${(Math.random() * 100000).toInt()}"
            val conn = URL(endpoint).openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.doInput = true
            conn.connectTimeout = 30_000
            conn.readTimeout = 30_000
            // Set Content-Type with the exact boundary we use in the body
            conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
            conn.setRequestProperty("Accept", "application/json")

            // Build multipart body exactly as the JS FormData does
            val bodyBytes = buildString {
                fields.forEach { (k, v) ->
                    append("--$boundary\r\n")
                    append("Content-Disposition: form-data; name=\"$k\"\r\n")
                    append("\r\n")
                    append(v)
                    append("\r\n")
                }
                append("--$boundary--\r\n")
            }.toByteArray(Charsets.UTF_8)

            conn.setRequestProperty("Content-Length", bodyBytes.size.toString())
            conn.outputStream.use { it.write(bodyBytes) }

            val code = conn.responseCode
            val responseText = try {
                if (code in 200..299)
                    conn.inputStream.bufferedReader(Charsets.UTF_8).readText()
                else
                    conn.errorStream?.bufferedReader(Charsets.UTF_8)?.readText() ?: "{}"
            } catch (e: Exception) { "{}" }
            conn.disconnect()

            android.util.Log.d("TypeEasyKB", "API $endpoint → $code: $responseText")
            try {
                JSONObject(responseText)
            } catch (_: Exception) {
                JSONObject().put("error", responseText.ifBlank { "Invalid server response" })
            }
        } catch (e: Exception) {
            android.util.Log.e("TypeEasyKB", "API call failed: ${e.message}", e)
            JSONObject().put("error", e.message ?: "Request failed")
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Result bar helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @param isError  true  → red text, no Insert button
     *                 false → normal text, Insert button shown (unless isLoading)
     * @param isLoading true → grey text, no Insert button (in-progress state)
     */
    private fun refreshKeyboardConfig() {
        if (!::prefs.isInitialized) return
        fromLang = prefs.getString(KeyboardModule.KEY_FROM_LANG, "en")?.trim().orEmpty().ifEmpty { "en" }
        toLang = prefs.getString(KeyboardModule.KEY_TO_LANG, "ta")?.trim().orEmpty().ifEmpty { "ta" }
        userId = prefs.getString(KeyboardModule.KEY_USER_ID, "")?.trim().orEmpty()
        val nextDark = resolveKeyboardIsDark()
        if (nextDark != keyboardIsDark) {
            keyboardIsDark = nextDark
            if (::rootLayout.isInitialized) applyThemeToViews()
        } else {
            keyboardIsDark = nextDark
        }
    }

    private fun hasUserId(): Boolean {
        return userId.isNotBlank() && userId != "0" && !userId.equals("undefined", ignoreCase = true)
    }

    private fun extractApiText(json: JSONObject, vararg keys: String): String? {
        for (key in keys) {
            val direct = json.optString(key, "").trim()
            if (direct.isNotEmpty() && direct != "null") return direct
        }
        val data = json.optJSONObject("data")
        if (data != null) {
            for (key in keys) {
                val nested = data.optString(key, "").trim()
                if (nested.isNotEmpty() && nested != "null") return nested
            }
        }
        return null
    }

    private fun voiceCommandSuccessMessage(payload: VoiceCommandClient.ExecuteResult?): String {
        val status = payload?.status?.trim()?.lowercase().orEmpty()
        return when {
            status.contains("success") -> "Success"
            status.contains("execut") -> "Done"
            status.contains("complete") -> "Done"
            status.contains("ok") -> "Done"
            else -> "Done"
        }
    }

    private fun showSnackbar(message: String, durationMs: Long = 2200L) {
        if (!::snackbarLabel.isInitialized) return
        snackbarDismissRunnable?.let { mainHandler.removeCallbacks(it) }
        snackbarLabel.text = message
        snackbarHost.visibility = View.VISIBLE
        snackbarLabel.animate().cancel()
        snackbarLabel.alpha = 0f
        snackbarLabel.animate().alpha(1f).setDuration(180).start()
        val task = Runnable { hideSnackbar() }
        snackbarDismissRunnable = task
        mainHandler.postDelayed(task, durationMs)
    }

    private fun hideSnackbar() {
        snackbarDismissRunnable?.let { mainHandler.removeCallbacks(it) }
        snackbarDismissRunnable = null
        if (!::snackbarLabel.isInitialized || snackbarHost.visibility != View.VISIBLE) return
        snackbarLabel.animate().cancel()
        snackbarLabel.animate().alpha(0f).setDuration(180).withEndAction {
            snackbarHost.visibility = View.GONE
        }.start()
    }

    private fun showResult(text: String, isError: Boolean = false, isLoading: Boolean = false) {
        if (!::resultLabel.isInitialized) return
        resultLabel.text = text
        resultLabel.setTextColor(when {
            isError   -> C_ERROR_TEXT
            isLoading -> Color.parseColor("#757575")
            else      -> C_KEY_TEXT
        })
        // Show Insert only when we have a real result (not error, not loading)
        resultInsertBtn.visibility = if (!isError && !isLoading) View.VISIBLE else View.GONE
        lastResultIsError = isError
        resultBar.visibility = View.VISIBLE
    }

    private fun hideResult() {
        if (!::resultBar.isInitialized) return
        resultBar.visibility = View.GONE
        resultLabel.text = ""
        resultInsertBtn.visibility = View.GONE
        pendingReplaceSelected = false
        pendingReplaceBeforeChars = 0
    }

    private fun rememberReplacementTarget(selected: String?, beforeCursor: String?) {
        pendingReplaceSelected = !selected.isNullOrBlank()
        pendingReplaceBeforeChars = if (pendingReplaceSelected) 0 else beforeCursor?.length ?: 0
    }

    private fun insertResult() {
        val text = resultLabel.text?.toString() ?: return
        if (text.isBlank() || lastResultIsError) return
        val ic = currentInputConnection ?: return
        if (!pendingReplaceSelected && pendingReplaceBeforeChars > 0) {
            ic.deleteSurroundingText(pendingReplaceBeforeChars, 0)
        }
        ic.commitText(text, 1)
        pendingReplaceSelected = false
        pendingReplaceBeforeChars = 0
        hideResult()
    }
}
