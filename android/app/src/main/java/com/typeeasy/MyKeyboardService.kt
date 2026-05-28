package com.typeeasy

import com.typeeasy.generated.ApiConfig
import android.content.Context
import android.content.SharedPreferences
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.inputmethodservice.InputMethodService
import android.os.Handler
import android.os.Looper
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
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import java.util.concurrent.Executors

/**
 * Type Easy Keyboard — Light lavender theme.
 * - Long-press letter: popup with special chars for that key
 * - Long-press backspace: clear all text
 * - Professional Unicode icons throughout
 * - Translate & Grammar via TypeEasy API
 * - Voice input with SpeechRecognizer
 * - Emoji panel with category tabs
 */
class MyKeyboardService : InputMethodService() {

    // ── Theme ─────────────────────────────────────────────────────────────────
    private val C_BG         = Color.parseColor("#E8EAF6")
    private val C_KEY_LETTER = Color.WHITE
    private val C_KEY_ACTION = Color.parseColor("#C5CAE9")
    private val C_KEY_TEXT   = Color.parseColor("#212121")
    private val C_HINT_TEXT  = Color.parseColor("#9E9E9E")
    private val C_TOOLBAR_BG = Color.parseColor("#3F51B5")
    private val C_TOOLBAR_TXT= Color.WHITE
    private val C_RESULT_BG  = Color.parseColor("#F5F5F5")
    private val C_PRIMARY    = Color.parseColor("#3F51B5")
    private val C_SUGGESTION = Color.parseColor("#ECEFF1")
    private val C_ERROR_TEXT = Color.parseColor("#B71C1C")
    private val C_SUCCESS    = Color.parseColor("#1B5E20")

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

    // ── Background work ───────────────────────────────────────────────────────
    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())

    // ── View refs ─────────────────────────────────────────────────────────────
    private lateinit var rootLayout: LinearLayout
    private lateinit var suggestionRow: LinearLayout
    private lateinit var resultBar: LinearLayout
    private lateinit var resultLabel: TextView
    private lateinit var resultInsertBtn: TextView
    private lateinit var voiceBar: LinearLayout
    private lateinit var voiceLabel: TextView
    private lateinit var settingsPanel: LinearLayout
    private lateinit var keysContainer: LinearLayout
    private lateinit var emojiPanel: FrameLayout
    private var popupWindow: PopupWindow? = null
    private var languagePopupWindow: PopupWindow? = null
    private var pendingReplaceSelected = false
    private var pendingReplaceBeforeChars = 0

    // ── Word suggestions ──────────────────────────────────────────────────────
    private val commonWords = listOf(
        "the","be","to","of","and","a","in","that","have","it","for","not","on",
        "with","he","as","you","do","at","this","but","his","by","from","they",
        "we","say","her","she","or","an","will","my","one","all","would","there",
        "their","what","so","up","out","if","about","who","get","which","go","me",
        "when","make","can","like","time","no","just","him","know","take","people",
        "into","year","your","good","some","could","them","see","other","than",
        "then","now","look","only","come","its","over","think","also","back",
        "after","use","two","how","our","work","first","well","way","even","new",
        "want","because","any","these","give","day","most","us","great","need"
    )

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
        buildSuggestionRow()
        buildFeatureToolbar()
        buildResultBar()
        buildVoiceBar()
        buildSettingsPanel()
        buildKeys()
        buildEmojiPanel()
        return rootLayout
    }

    override fun onStartInputView(info: EditorInfo?, restarting: Boolean) {
        super.onStartInputView(info, restarting)
        refreshKeyboardConfig()
        renderSettingsPanel()
        if (info != null) {
            val caps = (info.inputType and android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES) != 0
            if (caps && layer == Layer.ALPHA) setLayer(Layer.SHIFT)
        }
    }

    override fun onFinishInput() {
        super.onFinishInput()
        popupWindow?.dismiss()
        languagePopupWindow?.dismiss()
        stopVoice()
        hideResult()
        if (showSettings) toggleSettings()
        if (layer == Layer.EMOJI) setLayer(Layer.ALPHA)
    }

    override fun onDestroy() {
        popupWindow?.dismiss()
        languagePopupWindow?.dismiss()
        stopVoice()
        executor.shutdownNow()
        super.onDestroy()
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Suggestion row
    // ─────────────────────────────────────────────────────────────────────────

    private fun buildSuggestionRow() {
        val scroll = HorizontalScrollView(this).apply {
            layoutParams = LinearLayout.LayoutParams(MATCH, dp(36))
            setBackgroundColor(C_SUGGESTION)
            isHorizontalScrollBarEnabled = false
        }
        suggestionRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            layoutParams = ViewGroup.LayoutParams(WRAP, MATCH)
            setPadding(dp(8), 0, dp(8), 0)
        }
        scroll.addView(suggestionRow)
        rootLayout.addView(scroll)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Feature toolbar  — Unicode professional icons
    //   文A = translate   A✓ = grammar   🎙 = mic   ⚙ = settings
    // ─────────────────────────────────────────────────────────────────────────

    private fun buildFeatureToolbar() {
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(C_TOOLBAR_BG)
            layoutParams = LinearLayout.LayoutParams(MATCH, dp(46))
            setPadding(dp(8), dp(4), dp(8), dp(4))
            gravity = Gravity.CENTER_VERTICAL
        }
        // Translate icon: 文A (Unicode translation symbol)
        bar.addView(toolBtn("文A") { onTranslatePress() })
        bar.addView(toolDivider())
        // Grammar icon: A✓
        bar.addView(toolBtn("A✓") { onGrammarPress() })
        bar.addView(toolDivider())
        // Mic icon: 🎙 (studio microphone) — same bold style as 文A and A✓
        bar.addView(toolBtn("🎙") { onVoicePress() })
        bar.addView(View(this).apply { layoutParams = LinearLayout.LayoutParams(0, 1, 1f) })
        // Settings: ⚙
        bar.addView(toolBtn("⚙") { toggleSettings() })
        rootLayout.addView(bar)
    }

    private fun toolBtn(icon: String, action: () -> Unit) = TextView(this).apply {
        text = icon; textSize = 17f; gravity = Gravity.CENTER
        setTextColor(C_TOOLBAR_TXT); setBackgroundColor(Color.TRANSPARENT)
        typeface = Typeface.DEFAULT_BOLD
        layoutParams = LinearLayout.LayoutParams(dp(48), dp(38))
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
            text = "↙ Insert"; textSize = 12f
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

    // ─────────────────────────────────────────────────────────────────────────
    // Voice bar — mic icon + status + stop icon (■)
    // ─────────────────────────────────────────────────────────────────────────

    private fun buildVoiceBar() {
        voiceBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(Color.parseColor("#E8EAF6"))
            layoutParams = LinearLayout.LayoutParams(MATCH, dp(46))
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(12), 0, dp(12), 0)
            visibility = View.GONE
        }
        // Mic icon — same style as toolbar icons (Unicode, not emoji)
        val micIcon = TextView(this).apply {
            text = "🎙"; textSize = 20f; typeface = Typeface.DEFAULT_BOLD
            setTextColor(C_PRIMARY)
            layoutParams = LinearLayout.LayoutParams(WRAP, WRAP).also { it.setMargins(0,0,dp(8),0) }
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
    // Settings panel
    // ─────────────────────────────────────────────────────────────────────────

    private fun buildSettingsPanel() {
        settingsPanel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#E8EAF6"))
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
            text = "Translation Language"
            textSize = 12f
            setTextColor(Color.parseColor("#757575"))
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
            setTextColor(C_KEY_TEXT)
            background = roundRect(Color.WHITE, dp(18)).apply {
                setStroke(dp(1), Color.parseColor("#DADDE8"))
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
            background = roundRect(Color.WHITE, dp(17)).apply {
                setStroke(dp(1), Color.parseColor("#DADDE8"))
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
            setBackgroundColor(Color.WHITE)
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
                    setTextColor(C_KEY_TEXT)
                    layoutParams = LinearLayout.LayoutParams(0, WRAP, 1f)
                })
                addView(TextView(this@MyKeyboardService).apply {
                    text = languageShort(code).uppercase()
                    textSize = 11f
                    setTextColor(Color.parseColor("#5F6368"))
                    typeface = Typeface.DEFAULT_BOLD
                    gravity = Gravity.CENTER
                    layoutParams = LinearLayout.LayoutParams(dp(40), WRAP)
                })
                if ((isFrom && fromLang == code) || (!isFrom && toLang == code)) {
                    setBackgroundColor(Color.parseColor("#EEF1FF"))
                }
                setOnClickListener {
                    if (isFrom) fromLang = code else toLang = code
                    persistLanguages()
                    languagePopupWindow?.dismiss()
                    renderSettingsPanel()
                }
            })
            list.addView(View(this).apply {
                setBackgroundColor(Color.parseColor("#EEEEEE"))
                layoutParams = LinearLayout.LayoutParams(MATCH, dp(1))
            })
        }
        val scroll = ScrollView(this).apply {
            addView(list)
            layoutParams = ViewGroup.LayoutParams(MATCH, dp(220))
        }
        languagePopupWindow = PopupWindow(scroll, dp(260), dp(220), true).apply {
            isOutsideTouchable = true
            setBackgroundDrawable(GradientDrawable().apply {
                setColor(Color.WHITE)
                cornerRadius = dp(6).toFloat()
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
            setPadding(dp(4), dp(4), dp(4), dp(6))
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
                layoutParams = LinearLayout.LayoutParams(MATCH, dp(52))
                gravity = Gravity.CENTER
                setPadding(if (rowIdx == 1) dp(20) else dp(2), dp(2),
                           if (rowIdx == 1) dp(20) else dp(2), dp(2))
            }
            keys.forEach { logical ->
                val display = when {
                    isUpper && logical.length == 1 && logical[0].isLetter() -> logical.uppercase()
                    logical == "SHIFT" && layer == Layer.CAPS -> "⬆"   // filled = caps lock
                    logical == "SHIFT" -> "⇧"                           // outline = shift
                    logical == "BKSP"  -> "⌫"
                    logical == "ENTER" -> "↵"
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
            isSpace   -> Color.WHITE
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
                .also { it.setMargins(dp(3), dp(3), dp(3), dp(3)) }
        }

        val keyView: View = if (isTopRow && isLetter) {
            FrameLayout(this).apply {
                background = roundRect(bgColor, dp(8)); elevation = dp(1).toFloat()
                layoutParams = FrameLayout.LayoutParams(MATCH, MATCH)
                addView(TextView(this@MyKeyboardService).apply {
                    text = display; textSize = 18f; gravity = Gravity.CENTER
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
                    logical in listOf("SHIFT","BKSP","ENTER") -> 18f
                    else -> 18f
                }
                gravity = Gravity.CENTER
                setTextColor(if (isShiftOn) Color.WHITE else C_KEY_TEXT)
                background = roundRect(bgColor, dp(8)); elevation = dp(1).toFloat()
                layoutParams = FrameLayout.LayoutParams(MATCH, MATCH)
            }
        }

        wrapper.addView(keyView)
        wrapper.setOnClickListener { handleKey(logical) }

        // Long-press: letter → show alternatives popup; backspace → clear all
        wrapper.setOnLongClickListener {
            when {
                isLetter -> {
                    showAlternativesPopup(logical, wrapper)
                    true
                }
                isTopRow && logical.length == 1 && logical[0].isLetter() -> {
                    // Long-press top row → insert the number hint directly
                    val num = topRowHints[logical]
                    if (num != null) currentInputConnection?.commitText(num, 1)
                    true
                }
                logical == "BKSP" -> {
                    val ic = currentInputConnection ?: return@setOnLongClickListener true
                    ic.beginBatchEdit()
                    ic.performContextMenuAction(android.R.id.selectAll)
                    ic.commitText("", 1)
                    ic.endBatchEdit()
                    suggestionRow.removeAllViews()
                    true
                }
                else -> false
            }
        }
        return wrapper
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Long-press alternatives popup
    // ─────────────────────────────────────────────────────────────────────────

    private fun showAlternativesPopup(logical: String, anchor: View) {
        val alts = keyAlternatives[logical] ?: return
        popupWindow?.dismiss()

        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(Color.WHITE)
            background = roundRect(Color.WHITE, dp(10)).also {
                it.setStroke(dp(1), Color.parseColor("#C5CAE9"))
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
                    currentInputConnection?.commitText(alt, 1)
                    popupWindow?.dismiss()
                }
            })
        }

        val totalWidth = (alts.size * (dp(38) + dp(4))) + dp(8)
        popupWindow = PopupWindow(row, totalWidth, dp(52), true).apply {
            isOutsideTouchable = true
            setBackgroundDrawable(null)
            showAsDropDown(anchor, 0, -dp(100))
        }
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
                    setOnClickListener { currentInputConnection?.commitText(emoji, 1) }
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
            setOnClickListener { currentInputConnection?.deleteSurroundingText(1, 0) }
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
        val ic = currentInputConnection ?: return
        when {
            logical == "space" -> {
                ic.commitText(" ", 1)
                if (layer == Layer.SHIFT) setLayer(Layer.ALPHA)
                updateSuggestions()
            }
            logical == "BKSP" -> {
                val sel = ic.getSelectedText(0)
                if (!TextUtils.isEmpty(sel)) ic.commitText("", 1)
                else ic.deleteSurroundingText(1, 0)
                updateSuggestions()
            }
            logical == "ENTER" -> {
                ic.sendKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ENTER))
                ic.sendKeyEvent(KeyEvent(KeyEvent.ACTION_UP,   KeyEvent.KEYCODE_ENTER))
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
                val out = if (layer == Layer.SHIFT || layer == Layer.CAPS) logical.uppercase() else logical
                ic.commitText(out, 1)
                if (layer == Layer.SHIFT) setLayer(Layer.ALPHA)
                checkAutoCap()
                updateSuggestions()
            }
        }
    }

    private fun setLayer(l: Layer) {
        layer = l
        if (l == Layer.EMOJI) {
            keysContainer.visibility = View.GONE
            emojiPanel.visibility = View.VISIBLE
        } else {
            emojiPanel.visibility = View.GONE
            keysContainer.visibility = View.VISIBLE
            renderKeys()
        }
    }

    private fun toggleSettings() {
        showSettings = !showSettings
        settingsPanel.visibility = if (showSettings) View.VISIBLE else View.GONE
    }

    private fun checkAutoCap() {
        if (layer != Layer.ALPHA) return
        val ic = currentInputConnection ?: return
        val before = ic.getTextBeforeCursor(3, 0)?.toString() ?: return
        if (before.length >= 2 && before.takeLast(2) in listOf(". ", "! ", "? ")) setLayer(Layer.SHIFT)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Word suggestions
    // ─────────────────────────────────────────────────────────────────────────

    private fun updateSuggestions() {
        val ic = currentInputConnection ?: return
        val before = ic.getTextBeforeCursor(20, 0)?.toString() ?: return
        val lastWord = before.trimEnd().split(Regex("\\s+")).lastOrNull()?.lowercase() ?: return
        suggestionRow.removeAllViews()
        if (lastWord.length < 2) return
        commonWords.filter { it.startsWith(lastWord) && it != lastWord }.take(5).forEach { word ->
            suggestionRow.addView(TextView(this).apply {
                text = word; textSize = 13f; setTextColor(C_KEY_TEXT)
                setPadding(dp(16), 0, dp(16), 0); gravity = Gravity.CENTER_VERTICAL
                layoutParams = LinearLayout.LayoutParams(WRAP, MATCH)
                setOnClickListener {
                    ic.deleteSurroundingText(lastWord.length, 0)
                    ic.commitText("$word ", 1)
                    suggestionRow.removeAllViews()
                }
            })
            suggestionRow.addView(View(this).apply {
                setBackgroundColor(Color.parseColor("#BDBDBD"))
                layoutParams = LinearLayout.LayoutParams(dp(1), MATCH)
            })
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
        if (!hasUserId()) {
            showResult("Open Type Easy and log in before using Translate.", isError = true)
            return
        }
        showResult("Translating…", isError = false, isLoading = true)
        rememberReplacementTarget(selected, beforeCursor)
        executor.execute {
            val result = callApi(
                ApiConfig.typeEasyUrl(ApiConfig.Endpoints.TRANSLATE),
                "user_id" to userId,
                "text" to text,
                "target_language" to toLang
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

    private fun stopVoice() {
        speechRecognizer?.stopListening()
        speechRecognizer?.destroy()
        speechRecognizer = null
        isListening = false
        if (::voiceBar.isInitialized) voiceBar.visibility = View.GONE
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
