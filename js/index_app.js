import { getBirthData, getSwiss, normalizeDegrees } from "./birth_engine.js?v=103";
import { logPredictionToReport, getStoredReport, clearStoredReport, updateReportBadgeCount } from "./report_manager.js";
import { openTranscriptAdminModal, getMatchingTranscriptLines } from "./transcript_module.js?v=241";

let currentBirthProfile = null;
let currentActiveTab = "week"; // "week" | "month" | "year" | "general"
const tabCache = new Map();

const COMBINED_METHOD_KEY = "combined";

const GLOBAL_CITY_TZ_DB = {
    "chennai": 5.5, "mumbai": 5.5, "delhi": 5.5, "kolkata": 5.5, "bengaluru": 5.5,
    "hyderabad": 5.5, "ahmedabad": 5.5, "pune": 5.5, "jaipur": 5.5, "lucknow": 5.5,
    "singapore": 8.0, "dubai": 4.0, "abu dhabi": 4.0, "sharjah": 4.0,
    "london": 0.0, "manchester": 0.0, "birmingham": 0.0, "paris": 1.0, "berlin": 1.0,
    "new york": -5.0, "miami": -5.0, "boston": -5.0, "toronto": -5.0, "montreal": -5.0,
    "chicago": -6.0, "houston": -6.0, "dallas": -6.0, "winnipeg": -6.0,
    "denver": -7.0, "phoenix": -7.0, "calgary": -7.0,
    "los angeles": -8.0, "san francisco": -8.0, "seattle": -8.0, "vancouver": -8.0
};

const METALS_MARKET_OUTLOOK = {
    goldNote: "Gold faces near-term pressure from a firm dollar and interest-rate expectations after pulling back from earlier highs, while seasonal buying and central bank demand favor gradual accumulation on dips rather than chasing spikes.",
    silverNote: "Silver remains noticeably more volatile than gold—experiencing sharper pullbacks—so staggered, cautious entries on dips are safer than large one-time buys."
};

const SHIFT_DOMAIN_PROFILES = {
    saturn: {
        title: "Career, Duty & Patience",
        advice: "External progress can feel slow or demanding—focus on steady discipline, clear boundaries, and strengthening weak foundations rather than forcing quick wins."
    },
    jupiter: {
        title: "Growth, Wisdom & Budgets",
        advice: "A good stretch to review long-term goals, family values, and spending habits inwardly instead of over-expanding in one rush."
    },
    mars: {
        title: "Action, Courage & Temper",
        advice: "Watch for inner frustration, delayed plans, or pushing too hard before conditions are ready—keep your temper measured."
    },
    mercury: {
        title: "Life, Decisions & Communication",
        advice: "Expect revisions, misread messages, or shifting schedules—double-check details, paperwork, and plans before locking them in."
    },
    venus: {
        title: "Relationships, Comfort & Value",
        advice: "Past relationship themes, personal boundaries, and spending urges can resurface—take a calmer second look before reacting."
    }
};

function clearTabCache() {
    tabCache.clear();
}

function updateForecastSuiteHeader(profile) {
    const titleEl = document.getElementById("forecastSuiteTitle");
    if (!titleEl) return;

    if (!profile) {
        titleEl.textContent = 'Forecast Suite : "Profile details"';
        return;
    }

    const nakshatra = profile.nakshatra?.name || "Birth Star";
    const rasi = profile.rasi?.name || "Rasi";
    const zodiac = profile.zodiac?.name || "Zodiac";
    const rolePart = profile.inputs?.workNature ? ` • ${profile.inputs.workNature}` : "";
    titleEl.textContent = `Forecast Suite : "${nakshatra} (${rasi}) •${zodiac}${rolePart}"`; }  function syncReportButtonForTab(tabKey) { const reportBtn = document.getElementById("generateInsightBtn"); const hintEl = document.getElementById("suiteActionHint"); if (!reportBtn) return;  reportBtn.textContent = "Generate Report";  if (tabKey === "general") { reportBtn.style.display = "none"; if (hintEl) { hintEl.textContent = "General outlook is displayed directly on this tab without report generation."; } } else { reportBtn.style.display = "inline-block"; if (hintEl) { hintEl.textContent = "Combined synthesis across traditions automatically updates per tab."; } } }  function setProfileViewMode(hasStoredProfile) { const newUserDataRow = document.getElementById("newUserDataRow"); const studyControlCard = document.getElementById("studyControlCard");  if (hasStoredProfile) { if (newUserDataRow) newUserDataRow.style.display = "none"; if (studyControlCard) studyControlCard.style.display = "block"; } else { if (newUserDataRow) { newUserDataRow.style.display = "grid"; newUserDataRow.style.gridTemplateColumns = (window.innerWidth > 768) ? "1fr 1fr" : "1fr"; } if (studyControlCard) studyControlCard.style.display = "none"; } }  function getFormattedCurrentDate(dateObj = new Date()) { const dd = String(dateObj.getDate()).padStart(2, '0'); const mm = String(dateObj.getMonth() + 1).padStart(2, '0'); const yyyy = dateObj.getFullYear(); return `${yyyy}-${mm}-${dd}`;
}

function formatHumanReadableDate(dateObj) {
    return dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function resolveDateWindowForTab(tabKey, now = new Date()) {
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (tabKey === "week") {
        const dayOfWeek = base.getDay(); // 0 = Sunday
        const daysUntilSunday = dayOfWeek === 0 ? 0 : (7 - dayOfWeek);
        const startDate = new Date(base);
        startDate.setDate(base.getDate() + daysUntilSunday);

        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        return { startDate, endDate, spanDays: 7, stepDays: 1, label: "Weekly Forecast (Sun–Sat)" };
    }

    if (tabKey === "month") {
        const targetMonthOffset = base.getDate() <= 10 ? 0 : 1;
        const startDate = new Date(base.getFullYear(), base.getMonth() + targetMonthOffset, 1);
        const endDate = new Date(base.getFullYear(), base.getMonth() + targetMonthOffset + 1, 0);
        const spanDays = Math.max(1, Math.round((endDate - startDate) / 86400000));
        return {
            startDate,
            endDate,
            spanDays,
            stepDays: 1,
            label: `Monthly Forecast (${startDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })})`
        };
    }

    const startDate = new Date(base);
    const endDate = new Date(base);
    endDate.setDate(base.getDate() + 365);
    return { startDate, endDate, spanDays: 365, stepDays: 3, label: "Annual Forecast (12-Month Cycle)" };
}

async function analyzeTransitsForWindow(profile, windowInfo) {
    const swe = await getSwiss();
    const birthRasi = profile.rasi?.number || 10;

    const { startDate, spanDays, stepDays } = windowInfo;
    const planetDefs = [
        { key: "sun", id: swe.SE_SUN, label: "Sun" },
        { key: "mars", id: swe.SE_MARS, label: "Mars" },
        { key: "mercury", id: swe.SE_MERCURY, label: "Mercury" },
        { key: "jupiter", id: swe.SE_JUPITER, label: "Jupiter" },
        { key: "venus", id: swe.SE_VENUS, label: "Venus" },
        { key: "saturn", id: swe.SE_SATURN, label: "Saturn" }
    ];

    const retrogradeWindows = {};
    const careerPushDates = [];
    const cautionDates = [];
    let currentHouseMap = {};

    for (let offset = 0; offset <= spanDays; offset += stepDays) {
        const sampleDate = new Date(startDate);
        sampleDate.setDate(startDate.getDate() + offset);

        const jd = swe.julday(
            sampleDate.getFullYear(),
            sampleDate.getMonth() + 1,
            sampleDate.getDate(),
            6.5
        );

        const sampleHouses = {};

        for (const p of planetDefs) {
            const res = swe.calc_ut(jd, p.id, swe.SEFLG_SWIEPH | swe.SEFLG_SPEED | swe.SEFLG_SIDEREAL);
            const lon = normalizeDegrees(res[0]);
            const speed = res[3];
            const transitRasi = Math.floor(lon / 30) + 1;
            const houseFromMoon = ((transitRasi - birthRasi + 12) % 12) + 1;

            sampleHouses[p.key] = { house: houseFromMoon, isRetrograde: speed < 0 };

            if (speed < 0) {
                const win = retrogradeWindows[p.key];
                const dayDiffFromPrev = win ? Math.round((sampleDate - win.lastSeen) / 86400000) : 0;
                if (!win || dayDiffFromPrev > stepDays + 1) {
                    retrogradeWindows[p.key] = {
                        key: p.key,
                        label: p.label,
                        start: sampleDate,
                        end: sampleDate,
                        lastSeen: sampleDate,
                        house: houseFromMoon
                    };
                } else {
                    win.end = sampleDate;
                    win.lastSeen = sampleDate;
                }
            }
        }

        if (offset === 0) {
            currentHouseMap = sampleHouses;
        }

        const sunGood = [3, 6, 10, 11].includes(sampleHouses.sun.house);
        const jupGood = [2, 5, 7, 9, 11].includes(sampleHouses.jupiter.house);
        const marsGood = [3, 6, 10, 11].includes(sampleHouses.mars.house);

        if ((sunGood && jupGood) || (marsGood && jupGood)) {
            careerPushDates.push(sampleDate);
        }

        if ([7, 8, 12].includes(sampleHouses.mars.house) || [8, 12].includes(sampleHouses.sun.house)) {
            cautionDates.push(sampleDate);
        }
    }

    return {
        currentHouseMap,
        retrogradeWindows: Object.values(retrogradeWindows),
        careerPushDates,
        cautionDates
    };
}

function appendTranscriptNotes(baseHtml, bucket, rasiName, horizonTag) {
    const lines = getMatchingTranscriptLines(bucket, rasiName, horizonTag);
    if (!lines || lines.length === 0) return baseHtml;
    const joined = lines.slice(-2).map(l => `• ${l}`).join("<br>"); return `${baseHtml}<div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed rgba(255,215,0,0.25); font-size: 0.9rem; color: #fde68a;">${joined}</div>`; }  function buildHorizonSpecificCautionHtml(tabKey, windowInfo, transitData) { const cStart = transitData.cautionDates.length > 0 ? formatHumanReadableDate(transitData.cautionDates[0]) : null; const cEnd = transitData.cautionDates.length > 0 ? formatHumanReadableDate(transitData.cautionDates[transitData.cautionDates.length - 1]) : null; const datePhrase = cStart && cEnd ? (cStart === cEnd ? `around <strong>${cStart}</strong>` : `between <strong>${cStart}</strong> and <strong>${cEnd}</strong>`)
        : `across <strong>${formatHumanReadableDate(windowInfo.startDate)} to${formatHumanReadableDate(windowInfo.endDate)}</strong>`;

    let heading = "Caution Window";
    let intro = "";
    let scenarios = [];

    if (tabKey === "week") {
        heading = "Weekly Caution & Day-to-Day Traps (Sun–Sat)";
        intro = `During this upcoming week (${datePhrase}), short-term mood swings and everyday rush can create avoidable snags:`;
        scenarios = [
            "<strong>Quick Temper & Snap Replies:</strong> A tired mood or crowded schedule can make you react sharply to a minor remark—pause before answering messages or family questions.",
            "<strong>Commute, Queue & Errand Delays:</strong> Traffic slowdowns, misheard timings, or misplaced items are more likely on busy days—leave extra travel buffer and double-check details.",
            "<strong>Impulse Day Spending:</strong> Buying small extras out of stress or boredom adds up fast this week—hold off on non-essential purchases for a day."
        ];
    } else if (tabKey === "month") {
        heading = "Monthly Caution & Pressure Points";
        intro = `Across this monthly cycle (${datePhrase}), watch for recurring monthly friction around money, routines, and close relationships:`;
        scenarios = [
            "<strong>Monthly Budget & Bill Creep:</strong> Recurring expenses, household repairs, or sudden commitments can stretch your cash flow if you don't track outflows early in the month.",
            "<strong>Workload & Follow-Up Bottlenecks:</strong> Delays from colleagues, clients, or approvals may test your patience—keep clear written records and avoid forcing rushed conclusions.",
            "<strong>Domestic & Relationship Tension:</strong> Unspoken expectations or old misunderstandings can resurface at home or with a partner—address issues calmly before resentment builds."
        ];
    } else {
        heading = "Annual Caution & Longer-Term Turning Points";
        intro = `Over the broader 12-month stretch (${datePhrase}), larger cycles can bring deeper tests of patience, commitments, and stamina:`;
        scenarios = [
            "<strong>Major Commitments & Asset Moves:</strong> Avoid locking into big loans, property/vehicle deals, or high-stakes partnerships out of urgency—verify terms and long-term sustainability first.",
            "<strong>Burnout & Health Neglect:</strong> Pushing through months of mental pressure or irregular sleep can trigger chronic fatigue, acidity, or stress strain—pace your year in phases.",
            "<strong>Relationship & Loyalty Shifts:</strong> Longer-term tests around trust, boundaries, or changing priorities may surface—stay steady and don't make permanent decisions during temporary anger."
        ];
    }

    return `<div style="margin-top: 18px; padding: 14px; background: rgba(255,215,0,0.08); border: 1px dashed rgba(255,215,0,0.4); border-radius: 6px;">` +
        `<h4 style="margin: 0 0 8px 0; color: #ffd700; font-size: 1.02rem;">${heading}</h4>` +
        `<p style="margin: 0 0 10px 0; font-size: 0.94rem; line-height: 1.65;">${intro}</p>` +
        `<ul style="margin: 0; padding-left: 18px; font-size: 0.93rem; line-height: 1.65; color: #e2e8f0;">` +
        scenarios.map(item => `<li style="margin-bottom: 6px;">${item}</li>`).join("") +
        `</ul>` +
        `</div>`;
}

function buildRoleSpecificGuidance(profile, hm, retroKeys, transitData) {
    const status = (profile.inputs?.occupationStatus || "working").toLowerCase();
    const natureRaw = (profile.inputs?.workNature || "").trim();
    const natureLower = natureRaw.toLowerCase();
    const houseStatus = (profile.inputs?.houseStatus || "own").toLowerCase();
    const vehicleStatus = (profile.inputs?.vehicleStatus || "own").toLowerCase();

    const blocks = [];

    let roleTitle = "🧭 Role & Daily Situation";
    let roleBody = "";

    if (natureLower.includes("actor") || natureLower.includes("acting") || natureLower.includes("artist") || natureLower.includes("cinema")) {
        roleTitle = "🎬 Acting, Public Presence & Creative Breaks";
        roleBody = [2, 5, 10, 11].includes(hm.venus?.house) || [3, 10, 11].includes(hm.sun?.house)
            ? "Visibility and expressive timing look encouraging—prepare strong auditions, keep your craft sharp, and don't let slow callbacks shake your confidence."
            : "Expect casting delays or picky feedback—stay patient through rejection, keep refining your screen/stage presence, and avoid burning bridges out of frustration.";
    } else if (natureLower.includes("politician") || natureLower.includes("politics") || natureLower.includes("leader")) {
        roleTitle = "🏛️ Public Standing, Alliances & Timing";
        roleBody = [3, 6, 10, 11].includes(hm.sun?.house) || [3, 6, 11].includes(hm.mars?.house)
            ? "Support and public visibility are stronger when you speak plainly and back promises with real groundwork."
            : "Watch words carefully in public or group settings—shifting loyalties or sharp remarks can backfire fast; hold back hasty reactions.";
    } else if (natureLower.includes("school") || (status === "student" && !natureLower.includes("college"))) {
        roleTitle = "📖 School Studies & Exam Focus";
        roleBody = [2, 4, 5, 9].includes(hm.jupiter?.house) || [1, 4, 5].includes(hm.mercury?.house)
            ? "Concentration and recall respond well to steady daily revision—stick to a calm timetable rather than last-minute panic."
            : "Distractions, screen fatigue, or exam anxiety can pull focus away—break study blocks into short, focused sessions and get proper sleep.";
    } else if (natureLower.includes("college") || status === "student") {
        roleTitle = "🎓 College Stream, Skills & Direction";
        roleBody = "Lean into subjects where your natural curiosity and problem-solving stay consistent rather than chasing trends purely for show. Practical skill-building and steady revision matter more than rushing.";
    } else if (status === "non_working" || natureLower.includes("no work") || natureLower.includes("unemployed") || natureLower.includes("jobless")) {
        roleTitle = "🔍 Job Search, Openings & Morale";
        roleBody = "Waiting without a routine can drain self-worth fast. Keep a disciplined daily habit, reach out directly to genuine contacts, and protect tight cash reserves while avoiding high-risk shortcuts.";
    } else if (status === "business" || natureLower.includes("business") || natureLower.includes("trader")) {
        roleTitle = "📊 Business, Deals & Cash Flow";
        roleBody = transitData.careerPushDates.length > 0
            ? "Favorable windows support pushing key client follow-ups and high-value execution—still guard cash flow and don't over-extend credit during slower days."
            : "Keep overhead tight, verify terms before signing or shipping, and avoid letting impatience push you into bad deals.";
    } else {
        roleTitle = "💼 Work, Effort & Boss Dynamics";
        roleBody = transitData.careerPushDates.length > 0
            ? "Stronger transit windows give you a real chance to step up, deliver clean results, and earn boss or client trust without needing loud self-promotion."
            : "Pace your workload, keep written clarity on tasks, and avoid sharp clashes when others move slowly.";
    }

    if (natureRaw) {
        roleBody = `<strong>Profile Note (${natureRaw}):</strong>${roleBody}`;
    }
    blocks.push({ title: roleTitle, text: roleBody });

    const assetFavorable = [4, 9, 11].includes(hm.jupiter?.house) || ([4, 11].includes(hm.venus?.house) && !retroKeys.has("venus"));
    const assetCaution = retroKeys.has("saturn") || [4, 8, 12].includes(hm.mars?.house);

    let houseLine = "";
    if (houseStatus === "rented") {
        houseLine = assetFavorable && !assetCaution
            ? "<strong>House (Rented):</strong> Supportive timing favors planning a future home move/purchase on solid numbers rather than rushing emotionally."
            : "<strong>House (Rented):</strong> Focus on living comfort, clear agreements with landlords, and building down-payment savings before locking into a property move.";
    } else if (houseStatus === "shared") {
        houseLine = "<strong>House (Family / Shared):</strong> Clear boundaries and calm daily routines keep shared living peaceful.";
    } else {
        houseLine = assetCaution
            ? "<strong>House (Own House):</strong> Hold off on major home repairs or property commitments until friction and delays settle."
            : "<strong>House (Own House):</strong> Keep home upkeep practical and steady without overspending on impulse upgrades.";
    }

    let vehicleLine = "";
    if (vehicleStatus === "planning" || vehicleStatus === "none") {
        vehicleLine = assetFavorable && !assetCaution && !retroKeys.has("mercury")
            ? "<strong>Vehicle:</strong> Good window to compare options carefully and plan a practical purchase that fits your monthly budget comfortably."
            : "<strong>Vehicle:</strong> Double-check inspection details, loan/running costs, and timing—avoid rushing into a vehicle commitment under pressure.";
    } else {
        vehicleLine = retroKeys.has("mercury") || [3, 8].includes(hm.mars?.house)
            ? "<strong>Vehicle:</strong> Check servicing, documents, and commute buffer time—watch for rush or minor delays on the road."
            : "<strong>Vehicle:</strong> Routine upkeep and sensible driving habits keep travel smooth.";
    }

    blocks.push({
        title: "🏡 House & Vehicle Timing",
        text: `${houseLine}<br>${vehicleLine}`
    });

    return blocks;
}

function buildPersonalSections(profile, tabKey, windowInfo, transitData) {
    const rasiName = profile.rasi?.name || "";
    const gender = (profile.inputs?.gender || "unspecified").toLowerCase();
    const hm = transitData.currentHouseMap;
    const retroKeys = new Set(transitData.retrogradeWindows.map(r => r.key));
    const horizonTag = tabKey === "week" ? "weekly" : tabKey === "month" ? "monthly" : "annual";

    const sections = [];

    const roleBlocks = buildRoleSpecificGuidance(profile, hm, retroKeys, transitData);
    roleBlocks.forEach(rb => {
        sections.push({
            title: rb.title,
            html: appendTranscriptNotes(`<p style="margin: 0;">${rb.text}</p>`, "career", rasiName, horizonTag)
        });
    });

    let homeText = "";
    if ([2, 4, 8].includes(hm.saturn?.house) || [2, 4].includes(hm.mars?.house)) {
        homeText = "Inside your home, friction over daily routines, noise, or unspoken expectations can surface quickly. Lower your voice at home and give family members space before reacting.";
    } else if ([4, 5, 9, 11].includes(hm.jupiter?.house) || [4].includes(hm.venus?.house)) {
        homeText = "Your home environment feels warmer and more cooperative when evenings stay uncluttered and conversations stay honest.";
    }
    if (homeText || getMatchingTranscriptLines("home", rasiName, horizonTag).length > 0) {
        sections.push({
            title: "🏠 Home & Domestic Space",
            html: appendTranscriptNotes(homeText ? `<p style="margin: 0;">${homeText}</p>` : "", "home", rasiName, horizonTag)
        });
    }

    let publicText = "";
    if ([1, 3, 7, 8].includes(hm.mars?.house) || retroKeys.has("mercury")) {
        publicText = "In public spaces—crowded streets, queues, markets, or transit—patience can wear thin fast. Leave buffer time, watch belongings, and avoid sharp exchanges with strangers.";
    } else if ([3, 9].includes(hm.jupiter?.house) || [3, 9].includes(hm.venus?.house)) {
        publicText = "Outings, errands, and public movement flow more smoothly when you keep an unhurried pace.";
    }
    if (publicText || getMatchingTranscriptLines("public", rasiName, horizonTag).length > 0) {
        sections.push({
            title: "🏙️ Public Spaces & Travel",
            html: appendTranscriptNotes(publicText ? `<p style="margin: 0;">${publicText}</p>` : "", "public", rasiName, horizonTag)
        });
    }

    const jupiterFavorable = [2, 5, 7, 9, 11].includes(hm.jupiter?.house);
    const venusFavorable = [1, 2, 3, 4, 5, 7, 8, 9, 11, 12].includes(hm.venus?.house) && !retroKeys.has("venus");
    const hasCaution = transitData.cautionDates.length > 0 || retroKeys.has("venus");

    const timingLine = hasCaution
        ? "Avoid buying gold or silver out of anxiety, urgency, or sudden mood swings—wait for steadier footing."
        : jupiterFavorable || venusFavorable
            ? "Supportive timing favors gradual, measured accumulation near dips rather than chasing spikes."
            : "Treat metals as a steady reserve rather than a short-term gamble.";

    const genderLine = gender === "female"
        ? "For personal jewellery or family savings, compare making charges and purity carefully and add in comfortable steps."
        : gender === "male"
            ? "For bullion, ETFs, or family reserves, keep position sizes measured and avoid over-leveraging during swings."
            : "Keep allocations measured and separate long-term reserves from impulsive moves.";

    sections.push({
        title: "🪙 Wealth & Gold / Silver Guidance",
        html: appendTranscriptNotes(
            `<p style="margin: 0 0 8px 0;"><strong>Gold:</strong> ${METALS_MARKET_OUTLOOK.goldNote}${timingLine}</p>` +
            `<p style="margin: 0 0 8px 0;"><strong>Silver:</strong> ${METALS_MARKET_OUTLOOK.silverNote}</p>` +
            `<p style="margin: 0;"><strong>Personal Note:</strong> ${genderLine}</p>`,
            "finance",
            rasiName,
            horizonTag
        )
    });

    let loveText = "";
    if (venusFavorable) {
        loveText = "Warmth and sincerity come through more easily when you lower your guard. Small, honest gestures deepen trust.";
    } else if ([7, 8, 12].includes(hm.mars?.house) || retroKeys.has("venus")) {
        loveText = "Old hurts or sudden irritations can flare up quickly. Pause before speaking sharply out of pride or defensiveness.";
    }
    if (loveText || getMatchingTranscriptLines("love", rasiName, horizonTag).length > 0) {
        sections.push({
            title: "❤️ Love & Relationships",
            html: appendTranscriptNotes(loveText ? `<p style="margin: 0;">${loveText}</p>` : "", "love", rasiName, horizonTag)
        });
    }

    let healthText = "";
    if ([1, 6, 8, 12].includes(hm.mars?.house) || [6, 8, 12].includes(hm.saturn?.house)) {
        healthText = "Pushing past fatigue, skipping meals, or carrying mental strain late can trigger headaches, acidity, or body stiffness. Protect your sleep and take quiet breaks.";
    } else if ([1, 6, 11].includes(hm.jupiter?.house)) {
        healthText = "Steady daily habits—regular meals, light movement, and unhurried rest—support reliable stamina.";
    }
    if (healthText || getMatchingTranscriptLines("health", rasiName, horizonTag).length > 0) {
        sections.push({
            title: "🩺 Health & Energy",
            html: appendTranscriptNotes(healthText ? `<p style="margin: 0;">${healthText}</p>` : "", "health", rasiName, horizonTag)
        });
    }

    return sections;
}

function buildGeneralSections(tabKey, windowInfo) {
    const spanText = `${formatHumanReadableDate(windowInfo.startDate)} to${formatHumanReadableDate(windowInfo.endDate)}`;
    const horizonTag = tabKey === "week" ? "weekly" : tabKey === "month" ? "monthly" : "annual";
    const transcriptMacroLines = getMatchingTranscriptLines("macro", "all", horizonTag);

    const sections = [
        {
            title: "🌍 Global Economy, Prices & 2027 Outlook",
            html: appendTranscriptNotes(
                `<p style="margin: 0;">Broader cycles through early 2027 point to heightened global economic pressure, rising or sticky prices on everyday essentials, and elevated geopolitical friction (${spanText}). Build buffers gradually and avoid over-leveraging.</p>`,
                "macro",
                "all",
                horizonTag
            )
        },
        {
            title: "🛡️ Stockpiling Essentials & Savings Buffer",
            html: `<p style="margin: 0;">Keep a practical buffer of non-perishable groceries, staples, medicines, and household necessities—buying steadily what your household uses rather than panic-buying—while keeping emergency cash accessible.</p>`
        },
        {
            title: "🪙 Gold & Silver Macro View",
            html: `<p style="margin: 0;"><strong>Gold:</strong> ${METALS_MARKET_OUTLOOK.goldNote}<br><strong>Silver:</strong>${METALS_MARKET_OUTLOOK.silverNote}</p>`
        }
    ];

    if (transcriptMacroLines.length > 0) {
        sections.push({
            title: "🎙️ Imported Forecast Notes (General)",
            html: `<p style="margin: 0;">${transcriptMacroLines.map(l => `• ${l}`).join("<br>")}</p>`
        });
    }

    return sections;
}

function renderPredictionBlockWithBottomDivider(title, bodyHtml, isLast = false, accentColor = "rgba(255, 215, 0, 0.24)") {
    const dividerStyle = isLast
        ? "padding-bottom: 4px; margin-bottom: 0;"
        : `padding-bottom: 16px; margin-bottom: 16px; border-bottom: 1px dashed ${accentColor};`;

    return `<div style="padding: 6px 2px; ${dividerStyle}">` +
        `<h4 style="margin: 0 0 6px 0; color: #ffd700; font-size: 1.02rem;">${title}</h4>` +
        `<div style="font-size: 0.96rem; line-height: 1.65;">${bodyHtml}</div>` +
        `</div>`;
}

async function generateReportForTab(profile, tabKey) {
    const cacheKey = `${profile.inputs?.date \vert{}\vert{} "user"}_${profile.rasi?.number || 0}_${tabKey}_${getFormattedCurrentDate()}`;
    if (tabCache.has(cacheKey)) {
        return tabCache.get(cacheKey);
    }

    const windowInfo = resolveDateWindowForTab(tabKey);
    const spanText = `${formatHumanReadableDate(windowInfo.startDate)} to${formatHumanReadableDate(windowInfo.endDate)}`;
    const rasiName = profile.rasi?.name || "";

    let html = "";
    let title = "";

    if (tabKey === "general") {
        const generalSections = buildGeneralSections(tabKey, windowInfo);
        title = "General & Macro Outlook";
        html += `<h2 style="color: #ffd700; border-bottom: 1px solid rgba(255,215,0,0.3); padding-bottom: 8px; margin-top: 0;">General & Macro Outlook</h2>`;
        html += `<div style="font-size: 0.9rem; color: #