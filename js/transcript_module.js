const TRANSCRIPT_STORAGE_KEY = "nakshatra_transcript_features_v2";
const GEMINI_KEY_STORAGE = "nakshatra_admin_gemini_key";

const TAMIL_PHRASE_MAP = [
    { ta: "கணவன் மனைவிக்கு சண்டையாக இருந்தாலும்", en: "Even if there are arguments between husband and wife" },
    { ta: "கணவன் மனைவி", en: "husband and wife" },
    { ta: "சமாதானம் செய்து கொள்வது", en: "making peace and resolving things yourself" },
    { ta: "நன்மைகளை ஏற்படுத்தும்", en: "will bring good results" },
    { ta: "கவனமாக இருக்க வேண்டும்", en: "you must be careful" },
    { ta: "அதே சமயம்", en: "At the same time" },
    { ta: "பிள்ளைகள் விஷயத்திலும்", en: "regarding children as well" },
    { ta: "துணை அல்லது துணைவியார் விஷயத்திலும்", en: "regarding your spouse or partner as well" },
    { ta: "காதலி அமைப்பிலும்", en: "in romantic relationships" },
    { ta: "காதலர் அமைப்பிலும்", en: "in love partnerships" },
    { ta: "வெள்ளை கொடியோ அல்லது வெள்ளை புடவையோ", en: "a white flag or white saree" },
    { ta: "வெள்ளை பேஷீட்டியோ", en: "a white sheet" },
    { ta: "விலைவாசி உயர்வு", en: "rise in prices and cost of living" },
    { ta: "பொருளாதாரம்", en: "economy" },
    { ta: "விலைவாசி", en: "prices and cost of living" },
    { ta: "பொது பலன்", en: "General world outlook" },
    { ta: "ராசி பலன்", en: "Moon sign forecast" },
    { ta: "நட்சத்திரம்", en: "birth star" },
    { ta: "ராகு", en: "Rahu" },
    { ta: "கேது", en: "Ketu" },
    { ta: "சனி", en: "Saturn" },
    { ta: "குரு", en: "Jupiter" },
    { ta: "செவ்வாய்", en: "Mars" },
    { ta: "புதன்", en: "Mercury" },
    { ta: "சுக்கிரன்", en: "Venus" },
    { ta: "சூரியன்", en: "Sun" },
    { ta: "சந்திரன்", en: "Moon" },
    { ta: "வக்ரம்", en: "retrograde" },
    { ta: "வேலை", en: "work and career" },
    { ta: "தொழில்", en: "business and work" },
    { ta: "பணம்", en: "money and finances" },
    { ta: "தங்கம்", en: "gold" },
    { ta: "வெள்ளி", en: "silver" },
    { ta: "குடும்பம்", en: "family and home" },
    { ta: "பிள்ளைகள்", en: "children" },
    { ta: "காதல்", en: "love and relationships" },
    { ta: "திருமணம்", en: "marriage" },
    { ta: "ஆரோக்கியம்", en: "health and energy" },
    { ta: "உடல்நலம்", en: "health" },
    { ta: "போர்", en: "global conflict and war tension" },
    { ta: "சேமிப்பு", en: "savings" },
    { ta: "கவனம்", en: "caution" },
    { ta: "சண்டை", en: "arguments or friction" },
    { ta: "நன்மை", en: "good outcomes" }
];

const BUCKET_KEYWORDS = {
    career: ["career", "work", "job", "boss", "superior", "promotion", "office", "business", "profession", "colleague", "authority"],
    finance: ["money", "finance", "wealth", "saving", "savings", "invest", "investment", "gold", "silver", "bullion", "expense", "debt", "profit", "loss", "budget"],
    home: ["home", "house", "family", "mother", "father", "spouse", "husband", "wife", "elder", "domestic", "kitchen", "household", "peace", "children"],
    public: ["travel", "trip", "road", "traffic", "public", "crowd", "crowded", "journey", "outsider", "commute", "market"],
    love: ["love", "relationship", "partner", "marriage", "heart", "trust", "loyalty", "affection", "romance", "romantic", "husband", "wife", "spouse"],
    health: ["health", "body", "sleep", "rest", "stress", "headache", "stomach", "energy", "stamina", "fatigue", "illness", "diet"],
    macro: ["world", "global", "economy", "economic", "inflation", "price", "prices", "war", "conflict", "stockpile", "groceries", "essential", "supply", "2027", "market", "nation"]
};

function stripTimestamps(input) {
    return String(input || "")
        .replace(/[\[(]\s*\d{1,2}:\d{2}(?::\d{2})?\s*[\])]/g, " ")
        .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:\d+\s*(?:hours?|hrs?|minutes?|mins?|seconds?|secs?|minutes|seconds)[,\s]*)+/gi, " ")
        .replace(/\b\d+\s*(?:hours?|hrs?|minutes?|mins?)(?:\s*,?\s*\d+\s*(?:seconds?|secs?))?\b/gi, " ")
        .replace(/\b\d+\s*(?:seconds?|secs?)\b/gi, " ")
        .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, " ");
}

function containsTamilScript(str) {
    return /[\u0B80-\u0BFF]/.test(String(str || ""));
}

function normalizeForDedupe(str) {
    return String(str || "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, "")
        .replace(/\s+/g, " ")
        .trim();
}

export function translateAndCleanTranscriptOffline(rawText) {
    let text = stripTimestamps(String(rawText || "").replace(/\r\n/g, "\n")).trim();
    if (!text) return "";

    const sortedMap = [...TAMIL_PHRASE_MAP].sort((a, b) => b.ta.length - a.ta.length);
    for (const item of sortedMap) {
        const escaped = item.ta.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        text = text.replace(new RegExp(escaped, "g"), ` ${item.en} `);
    }

    return text
        .replace(/\s+([.,!?;:])/g, "$1")
        .replace(/\s+/g, " ")
        .trim();
}

async function translateViaWebEndpoint(text) {
    // Split into chunks under 1200 chars so long transcripts translate reliably
    const chunks = [];
    let current = "";
    for (const part of text.split(/(?<=[.!?।])\s+/)) {
        if ((current + " " + part).length > 1200 && current) {
            chunks.push(current.trim());
            current = part;
        } else {
            current = current ? `${current} ${part}` : part;
        }
    }
    if (current.trim()) chunks.push(current.trim());

    const translatedChunks = [];
    for (const chunk of chunks) {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(chunk)}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = await resp.json();
        const piece = Array.isArray(json?.[0])
            ? json[0].map(item => item?.[0] || "").join("")
            : "";
        translatedChunks.push(piece || chunk);
    }

    return translatedChunks.join(" ").replace(/\s+/g, " ").trim();
}

export async function translateTranscriptSmart(rawText, apiKey = "") {
    const timestampStripped = stripTimestamps(String(rawText || "").replace(/\r\n/g, "\n")).trim();
    if (!timestampStripped) return "";

    const trimmedKey = String(apiKey || "").trim();
    if (trimmedKey) {
        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(trimmedKey)}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{
                                text:
                                    "Translate the entire transcript into clear, natural, human-centered English. " +
                                    "Leave no Tamil words untranslated. Do not include timestamps, speaker labels, or markdown bullets:\n\n" +
                                    timestampStripped
                            }]
                        }]
                    })
                }
            );

            if (response.ok) {
                const data = await response.json();
                const geminiText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (geminiText && geminiText.trim()) {
                    return stripTimestamps(geminiText).replace(/\s+/g, " ").trim();
                }
            }
        } catch (err) {
            console.warn("Gemini translation fallback:", err);
        }
    }

    if (containsTamilScript(timestampStripped)) {
        try {
            const webTranslated = await translateViaWebEndpoint(timestampStripped);
            if (webTranslated && !containsTamilScript(webTranslated)) {
                return stripTimestamps(webTranslated).replace(/\s+/g, " ").trim();
            }
            if (webTranslated) {
                return translateAndCleanTranscriptOffline(webTranslated);
            }
        } catch (err) {
            console.warn("Web translation fallback to offline dictionary:", err);
        }
    }

    return translateAndCleanTranscriptOffline(timestampStripped);
}

export function extractFeaturesFromTranslatedText(cleanedText, meta = {}) {
    if (!cleanedText) {
        return { addedCount: 0, buckets: {} };
    }

    const sentences = cleanedText
        .split(/(?<=[.!?।])\s+|\n+/)
        .map(s => s.trim())
        .filter(s => s.length >= 12);

    const store = getStoredTranscriptFeatures();
    const addedByBucket = {};
    let totalAdded = 0;

    for (const sentence of sentences) {
        const lower = sentence.toLowerCase();
        const normSentence = normalizeForDedupe(sentence);
        if (!normSentence) continue;

        let matchedBucket = null;
        let bestScore = 0;

        for (const [bucket, words] of Object.entries(BUCKET_KEYWORDS)) {
            let score = 0;
            for (const w of words) {
                if (lower.includes(w)) score += 1;
            }
            if (score > bestScore) {
                bestScore = score;
                matchedBucket = bucket;
            }
        }

        if (!matchedBucket) continue;

        const exists = store[matchedBucket].some(
            existing => normalizeForDedupe(existing.text) === normSentence
        );

        if (!exists) {
            store[matchedBucket].push({
                id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                text: sentence,
                rasi: (meta.rasi || "all").toLowerCase(),
                horizon: (meta.horizon || "all").toLowerCase(),
                source: meta.source || "YouTube Transcript",
                createdAt: new Date().toISOString()
            });
            addedByBucket[matchedBucket] = (addedByBucket[matchedBucket] || 0) + 1;
            totalAdded += 1;
        }
    }

    localStorage.setItem(TRANSCRIPT_STORAGE_KEY, JSON.stringify(store));
    return { addedCount: totalAdded, buckets: addedByBucket, translatedPreview: cleanedText };
}

export function getStoredTranscriptFeatures() {
    const empty = {
        career: [],
        finance: [],
        home: [],
        public: [],
        love: [],
        health: [],
        macro: []
    };

    try {
        const raw = localStorage.getItem(TRANSCRIPT_STORAGE_KEY);
        if (!raw) return empty;
        return { ...empty, ...JSON.parse(raw) };
    } catch {
        return empty;
    }
}

export function getMatchingTranscriptLines(bucket, rasiName = "", horizon = "") {
    const store = getStoredTranscriptFeatures();
    const list = store[bucket] || [];
    const rasiLower = String(rasiName || "").toLowerCase();
    const horizonLower = String(horizon || "").toLowerCase();

    const seen = new Set();
    const result = [];

    for (const item of list) {
        const rasiMatch = !item.rasi || item.rasi === "all" || (rasiLower && rasiLower.includes(item.rasi));
        const horizonMatch = !item.horizon || item.horizon === "all" || !horizonLower || item.horizon === horizonLower;
        const cleanText = stripTimestamps(item.text).replace(/\s+/g, " ").trim();
        const norm = normalizeForDedupe(cleanText);

        if (rasiMatch && horizonMatch && norm && !seen.has(norm) && !containsTamilScript(cleanText)) {
            seen.add(norm);
            result.push(cleanText);
        }
    }

    return result;
}

export function clearTranscriptFeatures() {
    localStorage.removeItem(TRANSCRIPT_STORAGE_KEY);
}

export function openTranscriptAdminModal(onUpdatedCallback) {
    let overlay = document.getElementById("adminTranscriptModalOverlay");

    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "adminTranscriptModalOverlay";
        overlay.style.cssText = [
            "display: none",
            "position: fixed",
            "inset: 0",
            "background: rgba(0, 0, 0, 0.86)",
            "z-index: 2000",
            "justify-content: center",
            "align-items: center"
        ].join(";");

        const savedKey = localStorage.getItem(GEMINI_KEY_STORAGE) || "";

        overlay.innerHTML = `
            <div style="background: #0b1326; border: 1px solid #ffd700; width: 92%; max-width: 720px; max-height: 88vh; border-radius: 8px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 12px 36px rgba(0,0,0,0.95);">
                <div style="background: #141e38; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,215,215,0.15);">
                    <h3 style="margin: 0; color: #ffd700; font-size: 1.05rem;">Admin Transcript Translator & Feature Injector</h3>
                    <button id="closeAdminTranscriptBtn" style="background: none; border: none; color: #fff; font-size: 1.2rem; cursor: pointer;">✕</button>
                </div>
                <div style="padding: 18px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; color: #e2e8f0;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <div>
                            <label style="font-size: 0.78rem; color: #ffd700; display: block; margin-bottom: 4px;">Target Rasi Filter (Optional):</label>
                            <input id="adminRasiInput" type="text" placeholder="all (or Makara, Tula, Simha...)" value="all" style="width: 100%; box-sizing: border-box; background: #070d1b; border: 1px solid rgba(255,215,215,0.25); color: #fff; padding: 8px; border-radius: 4px;">
                        </div>
                        <div>
                            <label style="font-size: 0.78rem; color: #ffd700; display: block; margin-bottom: 4px;">Target Horizon (Optional):</label>
                            <select id="adminHorizonSelect" style="width: 100%; background: #070d1b; border: 1px solid rgba(255,215,215,0.25); color: #fff; padding: 8px; border-radius: 4px;">
                                <option value="all" selected>All Horizons</option>
                                <option value="weekly">Weekly</option>
                                <option value="monthly">Monthly</option>
                                <option value="annual">Annual</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label style="font-size: 0.78rem; color: #ffd700; display: block; margin-bottom: 4px;">Optional Gemini API Key:</label>
                        <input id="adminGeminiKeyInput" type="password" placeholder="Optional; auto-translates Tamil to English automatically" value="${savedKey}" style="width: 100%; box-sizing: border-box; background: #070d1b; border: 1px solid rgba(255,215,215,0.25); color: #fff; padding: 8px; border-radius: 4px;">
                    </div>

                    <div>
                        <label style="font-size: 0.78rem; color: #ffd700; display: block; margin-bottom: 4px;">Paste Transcript Text (Tamil or English):</label>
                        <textarea id="adminTranscriptTextarea" rows="9" placeholder="" style="width: 100%; box-sizing: border-box; background: #070d1b; border: 1px solid rgba(255,215,215,0.25); color: #fff; padding: 10px; border-radius: 4px; font-family: inherit; font-size: 0.92rem; line-height: 1.5;"></textarea>
                    </div>

                    <div id="adminTranscriptStatus" style="font-size: 0.86rem; color: #fde68a; min-height: 20px;"></div>
                </div>
                <div style="background: #141e38; padding: 12px 18px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,215,215,0.15);">
                    <button id="clearAdminFeaturesBtn" style="background: #7f1d1d; color: #fff; border: none; padding: 7px 12px; border-radius: 4px; cursor: pointer; font-size: 0.82rem;">Clear Extracted Features</button>
                    <div style="display: flex; gap: 10px;">
                        <button id="cancelAdminTranscriptBtn" style="background: #334155; color: #fff; border: none; padding: 7px 14px; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">Close</button>
                        <button id="submitAdminTranscriptBtn" style="background: #caa437; color: #060d1a; font-weight: bold; border: none; padding: 7px 18px; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">Submit & Translate</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const closeFn = () => {
            overlay.style.display = "none";
        };

        overlay.querySelector("#closeAdminTranscriptBtn").addEventListener("click", closeFn);
        overlay.querySelector("#cancelAdminTranscriptBtn").addEventListener("click", closeFn);

        overlay.querySelector("#clearAdminFeaturesBtn").addEventListener("click", () => {
            if (confirm("Clear all extracted transcript features from local storage?")) {
                clearTranscriptFeatures();
                overlay.querySelector("#adminTranscriptStatus").innerText = "Cleared all stored transcript features.";
                if (typeof onUpdatedCallback === "function") onUpdatedCallback();
            }
        });

        overlay.querySelector("#submitAdminTranscriptBtn").addEventListener("click", async () => {
            const submitBtn = overlay.querySelector("#submitAdminTranscriptBtn");
            const rawVal = overlay.querySelector("#adminTranscriptTextarea").value;
            const rasiVal = overlay.querySelector("#adminRasiInput").value;
            const horizonVal = overlay.querySelector("#adminHorizonSelect").value;
            const keyVal = overlay.querySelector("#adminGeminiKeyInput").value.trim();
            const statusEl = overlay.querySelector("#adminTranscriptStatus");

            if (keyVal) {
                localStorage.setItem(GEMINI_KEY_STORAGE, keyVal);
            } else {
                localStorage.removeItem(GEMINI_KEY_STORAGE);
            }

            submitBtn.disabled = true;
            submitBtn.innerText = "Translating...";

            try {
                const translatedText = await translateTranscriptSmart(rawVal, keyVal);
                const result = extractFeaturesFromTranslatedText(translatedText, { rasi: rasiVal, horizon: horizonVal });

                if (result.addedCount === 0) {
                    statusEl.innerText = "No matching life/macro sentences found or textarea was empty.";
                    return;
                }

                const summaryParts = Object.entries(result.buckets).map(([k, v]) => `${k}: +${v}`);
                statusEl.innerText = `Translated to English & added ${result.addedCount} line(s) (${summaryParts.join(", ")}).`;
                overlay.querySelector("#adminTranscriptTextarea").value = "";
                if (typeof onUpdatedCallback === "function") onUpdatedCallback(result);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerText = "Submit & Translate";
            }
        });
    }

    overlay.style.display = "flex";
}