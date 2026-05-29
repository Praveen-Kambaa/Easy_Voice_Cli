package com.typeeasy

import com.typeeasy.generated.ApiConfig
import android.content.Context
import android.content.SharedPreferences
import android.graphics.Color
import android.graphics.PorterDuff
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
    private val C_BG          = Color.parseColor("#EAF4FF")
    private val C_KEY_LETTER  = Color.WHITE
    private val C_KEY_ACTION  = Color.parseColor("#B9DCFF")
    private val C_KEY_TEXT    = Color.parseColor("#0F172A")
    private val C_HINT_TEXT   = Color.parseColor("#64748B")
    private val C_TOOLBAR_BG  = Color.parseColor("#1E88FF")
    private val C_TOOLBAR_TXT = Color.WHITE
    private val C_RESULT_BG   = Color.parseColor("#F8FAFC")
    private val C_PRIMARY     = Color.parseColor("#1E88FF")
    private val C_SUGGESTION  = Color.parseColor("#DCEEFF")
    private val C_ERROR_TEXT  = Color.parseColor("#DC2626")
    private val C_SUCCESS     = Color.parseColor("#16A34A")
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
    // --- TOP 100 HIGH FREQUENCY WORDS ---
    "the","be","to","of","and","a","in","that","have","it","for","not","on",
    "with","he","as","you","do","at","this","but","his","by","from","they",
    "we","say","her","she","or","an","will","my","one","all","would","there",
    "their","what","so","up","out","if","about","who","get","which","go","me",
    "when","make","can","like","time","no","just","him","know","take","people",
    "into","year","your","good","some","could","them","see","other","than",
    "then","now","look","only","come","its","over","think","also","back",
    "after","use","two","how","our","work","first","well","way","even","new",
    "want","because","any","these","give","day","most","us","great","need",
    
    // --- CORE DAY-TO-DAY WORDS (101 - 500) ---
    "should","state","never","become","high","really","something","another","much",
    "own","leave","put","old","while","mean","keep","student","why","let",
    "same","big","group","begin","seem","country","help","talk","where",
    "turn","problem","every","start","hand","might","show","part","against",
    "place","such","again","few","case","week","company","system","each","right",
    "program","hear","question","during","play","government","run","small","number",
    "off","always","move","night","live","point","believe","hold","today","bring",
    "happen","next","without","before","large","million","must","home","under",
    "water","room","write","mother","area","national","money","story","young",
    "fact","month","different","lot","study","book","eye","job","word","though",
    "business","issue","side","kind","four","head","far","black","long","both",
    "little","house","yes","since","provide","service","around","friend","important",
    "father","sit","away","until","power","hour","game","line","end","among",
    "ever","stand","bad","lose","however","member","meet","car","city","almost",
    "include","continue","set","later","community","name","five","once","white",
    "least","president","learn","real","change","team","minute","best","several",
    "idea","kid","body","information","nothing","ago","lead","social","understand",
    "whether","watch","together","follow","parent","stop","face","anything","create",
    "public","already","speak","others","read","level","allow","add","office",
    "spend","door","health","person","art","sure","war","history","party",
    "within","grow","result","open","morning","walk","reason","low","win",
    "research","girl","guy","early","food","moment","himself","air","teacher",
    "force","offer","enough","education","across","although","remember","foot",
    "second","boy","maybe","toward","able","age","policy","everything","love",
    "process","music","including","consider","appear","actually","buy","probably",
    "human","wait","serve","market","die","send","expect","sense","build",
    "stay","fall","oh","nation","plan","cut","college","interest","death",
    "course","someone","experience","behind","reach","local","kill","six",
    "remain","effect","suggest","class","control","raise","care","perhaps",
    "late","hard","field","else","pass","former","sell","major","sometimes",
    "require","along","development","themselves","report","role","better",
    "economic","effort","decide","rate","strong","possible","heart","drug",
    "leader","light","voice","wife","whole","police","mind","finally","pull",
    "return","free","military","price","less","according","decision","explain",
    "son","hope","develop","view","relationship","carry","town","road","drive",
    "arm","true","federal","break","difference","thank","receive","value",
    "international","building","action","full","model","join","season","society",
    "tax","director","position","player","agree","especially","record","pick",
    "wear","paper","special","space","ground","form","support","event","official",
    "whose","matter","everyone","center","couple","site","project","hit","base",
    "activity","star","table","court","produce","eat","american","teach","oil",
    "half","situation","easy","cost","industry","figure","face","street","image",
    "itself","phone","either","data","cover","quite","picture","clear","practice",
    "piece","land","recent","doctor","wall","patient","worker","news","test",
    
    // --- EVERYDAY OBJECTS, ACTIONS & NOUNS (501 - 1000) ---
    "movie","certain","north","love","personal","open","support","simply","third",
    "technology","catch","step","baby","computer","type","attention","draw",
    "film","republican","tree","source","red","nearly","choose","cause","hair",
    "look","point","century","evidence","window","difficult","listen","soon",
    "culture","billion","dear","chance","brother","energy","period","course",
    "summer","realize","hundred","available","plant","likely","opportunity",
    "term","short","letter","condition","choice","place","single","rule",
    "daughter","administration","south","husband","congress","floor","campaign",
    "material","population","well","call","economy","medical","hospital",
    "church","close","thousand","risk","current","fire","future","wrong",
    "involve","defense","anyone","increase","security","bank","myself",
    "certainly","west","sport","board","seek","officer","strategy","deal",
    "performance","drop","recent","realty","forward","individual","top",
    "behavior","desire","firm","goal","quarter","agency","push","produce",
    "guitar","microphone","drums","piano","trumpet","violin","flute","screen",
    "keyboard","button","display","cable","adapter","charge","battery","power",
    "network","internet","server","cloud","database","application","software",
    "hardware","memory","storage","processor","graphics","sound","video","audio",
    "camera","sensor","sensor","signal","frequency","antenna","channel","station",
    "broadcast","satellite","radar","laser","fiber","copper","wire","switch",
    "router","modem","gateway","packet","protocol","address","domain","website",
    "browser","search","engine","index","query","result","link","click",
    "scroll","swipe","touch","press","hold","drag","drop","pinch","zoom",
    "rotate","shake","tilt","motion","speed","velocity","acceleration",
    "force","gravity","mass","weight","volume","density","pressure","temperature",
    "heat","cold","warm","cool","hot","freeze","melt","boil","vapor","steam",
    "smoke","dust","dirt","mud","sand","rock","stone","clay","soil","earth",
    "globe","map","compass","navigation","location","latitude","longitude",
    "altitude","depth","height","width","length","distance","range","radius",
    "diameter","circle","square","triangle","rectangle","polygon","cube",
    "sphere","cylinder","cone","pyramid","box","container","bag","pack",
    "package","pocket","wallet","purse","case","cover","sleeve","jacket",
    "coat","shirt","pants","jeans","shorts","skirt","dress","suit","tie",
    "hat","cap","helmet","mask","glasses","goggles","gloves","socks","shoes",
    "boots","sandals","slippers","belt","watch","ring","necklace","bracelet",
    "earring","button","zipper","pocket","thread","needle","scissors","knife",
    "fork","spoon","plate","bowl","cup","mug","glass","bottle","can","jar",
    "box","pot","pan","oven","stove","grill","toaster","blender","mixer",
    "fridge","freezer","sink","faucet","drain","pipe","tube","hose","valve",
    "pump","fan","blower","heater","cooler","filter","purifier","cleaner",
    
    // --- EXPANDED GENERAL DICTIONARY (1001 - 1500) ---
    "vacuum","broom","mop","bucket","soap","sponge","towel","cloth","rag",
    "brush","comb","razor","blade","scissors","clipper","file","mirror",
    "sink","toilet","shower","tub","bath","mat","curtain","blind","shade",
    "window","door","lock","key","handle","knob","hinge","latch","bolt",
    "screw","nail","pin","clip","staple","tape","glue","paste","cement",
    "brick","block","stone","tile","board","plank","beam","post","pillar",
    "wall","floor","ceiling","roof","attic","basement","cellar","garage",
    "porch","deck","patio","yard","lawn","garden","park","field","meadow",
    "forest","woods","jungle","swamp","marsh","desert","dune","beach",
    "coast","shore","cliff","cave","valley","canyon","hill","mountain",
    "peak","summit","ridge","pass","trail","path","road","street","avenue",
    "drive","lane","way","route","highway","freeway","bridge","tunnel",
    "rail","track","train","subway","metro","bus","coach","taxi","cab",
    "car","auto","truck","van","jeep","suv","pickup","wagon","trailer",
    "camper","rv","bike","cycle","moped","scooter","skate","board","sled",
    "skis","boat","ship","vessel","yacht","ferry","barge","tanker","sub",
    "plane","jet","aircraft","glider","copter","rocket","shuttle","capsule",
    "satellite","station","orbit","space","moon","sun","star","planet",
    "comet","asteroid","meteor","galaxy","cluster","nebula","void","hole",
    "time","date","year","month","week","day","hour","minute","second",
    "milli","micro","nano","pico","kilo","mega","giga","tera","peta",
    "byte","bit","word","code","data","file","folder","drive","disk",
    "tape","card","chip","board","circuit","relay","diode","switch",
    "plug","socket","cord","wire","cable","line","loop","mesh","grid",
    "matrix","array","list","stack","queue","tree","graph","node","edge",
    "vertex","face","mesh","solid","fluid","liquid","gas","plasma",
    "atom","ion","molecule","bond","chain","ring","group","series",
    "sequence","set","class","type","kind","sort","rank","order",
    "level","grade","stage","phase","step","pace","rate","speed",
    "flow","flux","current","wave","pulse","beam","ray","field",
    "force","load","stress","strain","shear","tension","torque",
    "twist","turn","spin","rotate","revolve","orbit","cycle","loop",
    "ring","coil","wind","wrap","bind","tie","knot","hitch","lash",
    "fasten","secure","lock","latch","bolt","screw","nail","pin",
    "rivet","weld","solder","braze","glue","bond","cement","mortar",
    "concrete","plaster","stucco","drywall","panel","sheet","plate",
    "strip","wire","rod","bar","beam","tube","pipe","hose","duct",
    "vent","drain","sewer","main","line","pipe","valve","cock","plug",
    
    // --- ADVANCED DAILY CHAT & PREDICTIVE TEXT (1501 - 2100+) ---
    "faucet","spigot","nozzle","spray","mist","fog","cloud","rain","sleet",
    "snow","hail","ice","frost","dew","condense","evaporate","sublime",
    "melt","freeze","thaw","warm","heat","scald","burn","char","scorch",
    "singe","smoke","blaze","flame","spark","ember","ash","soot","dust",
    "dirt","grime","smudge","stain","spot","blot","mark","scratch","dent",
    "crack","chip","break","fracture","shatter","smash","crush","grind",
    "powder","dust","flake","chip","chunk","block","lump","mass","heap",
    "pile","stack","bundle","bunch","pack","load","cargo","freight",
    "shipment","delivery","parcel","package","packet","envelope","letter",
    "note","card","ticket","pass","permit","license","badge","token",
    "coin","bill","cash","money","funds","capital","wealth","assets",
    "property","estate","land","ground","lot","plot","site","spot",
    "place","space","room","hall","chamber","cell","vault","safe",
    "box","chest","trunk","case","bag","sack","pouch","pocket",
    "purse","wallet","holder","clip","clamp","vise","grip","tongs",
    "pliers","wrench","spanner","driver","screw","bolt","nut","washer",
    "shim","spacer","gasket","seal","ring","o-ring","packing","gland",
    "bearing","bushing","sleeve","collar","shaft","axle","spindle",
    "hub","wheel","tire","rim","spoke","gear","pinion","rack","cam",
    "follower","lever","crank","arm","rod","link","pin","pivot",
    "hinge","joint","socket","ball","swivel","caster","wheel","roller",
    "track","slide","guide","rail","way","channel","groove","slot",
    "notch","slit","hole","bore","port","vent","outlet","inlet",
    "intake","exhaust","return","feed","supply","drain","waste",
    "refuse","trash","garbage","rubbish","debris","wreck","ruin",
    "spoil","waste","scrap","leftover","remnant","shred","scrap",
    "sliver","splinter","chip","shaving","dust","powder","grain",
    "speck","particle","molecule","atom","electron","proton","neutron",
    "quark","photon","lepton","boson","gluon","graviton","neutrino",
    "radiation","ray","beam","wave","pulse","signal","sign","token",
    "mark","stamp","seal","brand","label","tag","ticket","card",
    "slip","form","sheet","page","leaf","book","volume","tome",
    "scroll","roll","strip","band","belt","strap","cord","rope",
    "string","twine","thread","yarn","fiber","strand","filament",
    "wire","cable","line","track","path","trail","route","course",
    "way","road","street","avenue","boulevard","drive","lane",
    "court","terrace","place","plaza","square","park","garden",
    "yard","lawn","field","meadow","pasture","range","plain",
    "prairie","savanna","steppe","tundra","desert","waste","wild",
    "bush","jungle","forest","woods","grove","thicket","copse",
    "orchard","vineyard","farm","ranch","plantation","estate",
    "manor","house","home","abode","dwelling","residence","lodge",
    "cabin","shack","hut","hovel","shanty","tent","camp","shelter",
    "refuge","asylum","sanctuary","retreat","haven","port","harbor",
    "dock","pier","wharf","quay","marina","anchorage","roadstead",
    "sound","strait","channel","passage","pass","gap","gorge",
    "canyon","ravine","gully","chasm","abyss","gulf","bay","bight",
    "cove","inlet","fjord","estuary","delta","mouth","source",
    "spring","well","fountain","geyser","pool","pond","mere",
    "lake","loch","sea","ocean","deep","abyss","void","space",
    "sky","heaven","firmament","ether","air","atmosphere","climate",
    "weather","season","spring","summer","autumn","fall","winter",
    "solstice","equinox","period","epoch","era","age","eon",
    "time","moment","instant","second","minute","hour","day",
    "night","dawn","sunrise","morning","noon","afternoon","dusk",
    "sunset","evening","twilight","midnight","today","yesterday",
    "tomorrow","fortnight","month","quarter","year","decade",
    "century","millennium","forever","eternity","always","ever",
    "never","sometimes","often","frequently","usually","normally",
    "generally","typically","seldom","rarely","scarcely","hardly",
    "barely","just","only","solely","simply","merely","nearly",
    "almost","about","around","circa","roughly","approximately",
    "exactly","precisely","correctly","right","true","factual",
    "real","actual","genuine","authentic","sincere","honest",
    "frank","candid","direct","straight","plain","simple","easy",
    "smooth","flat","level","even","regular","uniform","steady",
    "stable","firm","solid","hard","tough","strong","robust",
    "hardy","sturdy","brave","bold","daring","heroic","valiant",
    "fearless","intrepid","dauntless","gallant","noble","grand",
    "great","huge","vast","immense","enormous","massive","giant",
    "mammoth","monstrous","colossal","titanic","mighty","powerful",
    "potent","strong","intense","sharp","keen","acute","shrewd",
    "smart","clever","bright","intelligent","wise","sage","learned",
    "expert","skilled","adept","proficient","capable","able","fit",
    "ready","prepared","alert","watchful","vigilant","wary","cautious",
    "careful","prudent","discreet","judicious","sane","rational",
    "logical","sound","valid","solid","good","excellent","fine",
    "choice","select","prime","first","chief","main","principal",
    "major","leading","capital","cardinal","central","focal","core",
    "middle","midst","center","heart","nucleus","hub","pivot",
    "axis","spindle","shaft","rod","pole","post","stake","peg",
    "pin","bolt","screw","nail","tack","brad","rivet","anchor",
    "fastener","tie","bond","link","chain","shackle","fetter",
    "handcuff","manacle","bond","rein","leash","tether","halter",
    "yoke","harness","gear","tackle","rig","apparatus","device",
    "engine","motor","machine","mechanism","tool","implement",
    "instrument","utensil","weapon","arms","armaments","ordnance",
    "artillery","cannon","gun","rifle","musket","pistol","revolver",
    "dagger","dirk","knife","blade","sword","saber","foil","rapier",
    "lance","spear","pike","halberd","javelin","dart","arrow","bolt",
    "missile","rocket","torpedo","bomb","shell","grenade","mine",
    "charge","blast","explosion","burst","eruption","outbreak",
    "flare","flash","gleam","glimmer","glint","sparkle","twinkle",
    "shimmer","glitter","glow","beam","ray","streak","line",
    "strip","band","belt","zone","region","area","district"
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
    //   文A = translate   A✓ = grammar   mic vector = voice   ⚙ = settings
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
        // Mic icon: flat white vector — matches 文A / A✓ toolbar style (not emoji)
        bar.addView(toolBtnIcon(R.drawable.ic_mic) { onVoicePress() })
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

    private fun toolBtnIcon(drawableRes: Int, action: () -> Unit) = ImageView(this).apply {
        setImageResource(drawableRes)
        setColorFilter(C_TOOLBAR_TXT, PorterDuff.Mode.SRC_IN)
        scaleType = ImageView.ScaleType.CENTER_INSIDE
        layoutParams = LinearLayout.LayoutParams(dp(48), dp(38))
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
            text = "Translation :"
            textSize = 14f
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
                    logical in listOf("SHIFT","ENTER") -> 24f
                    logical in listOf("BKSP") -> 18f
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
