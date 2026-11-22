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
    titleEl.textContent = `Forecast Suite : "${nakshatra} (${rasi}) • ${zodiac}${rolePart}"`;
}

function syncReportButtonForTab(tabKey) {
    const reportBtn = document.getElementById("generateInsightBtn");
    const hintEl = document.getElementById("suiteActionHint");
    if (!reportBtn) return;

    reportBtn.textContent = "Generate Report";

    if (tabKey === "general") {
        reportBtn.style.display = "none";
        if (hintEl) {
            hintEl.textContent = "General outlook is displayed directly on this tab without report generation.";
        }
    } else {
        reportBtn.style.display = "inline-block";
        if (hintEl) {
            hintEl.textContent = "Combined synthesis across traditions automatically updates per tab.";
        }
    }
}

function setProfileViewMode(hasStoredProfile) {
    const newUserDataRow = document.getElementById("newUserDataRow");
    const studyControlCard = document.getElementById("studyControlCard");

    if (hasStoredProfile) {
        if (newUserDataRow) newUserDataRow.style.display = "none";
        if (studyControlCard) studyControlCard.style.display = "block";
    } else {
        if (newUserDataRow) {
            newUserDataRow.style.display = "grid";
            newUserDataRow.style.gridTemplateColumns = (window.innerWidth > 768) ? "1fr 1fr" : "1fr";
        }
        if (studyControlCard) studyControlCard.style.display = "none";
    }
}

function getFormattedCurrentDate(dateObj = new Date()) {
    const dd = String(dateObj.getDate()).padStart(2, "0");
    const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
    const yyyy = dateObj.getFullYear();
    return `${yyyy}-${mm}-${dd}`;
}

function formatHumanReadableDate(dateObj) {
    return dateObj.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function resolveDateWindowForTab(tabKey, now = new Date()) {
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (tabKey === "week") {
        const dayOfWeek = base.getDay();
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
    const joined = lines.slice(-2).map(l => `• ${l}`).join("<br>");
    return `${baseHtml}<div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed rgba(255,215,0,0.25); font-size: 0.9rem; color: #fde68a;">${joined}</div>`;
}

function buildHorizonSpecificCautionHtml(tabKey, windowInfo, transitData) {
    const cStart = transitData.cautionDates.length > 0 ? formatHumanReadableDate(transitData.cautionDates[0]) : null;
    const cEnd = transitData.cautionDates.length > 0 ? formatHumanReadableDate(transitData.cautionDates[transitData.cautionDates.length - 1]) : null;
    const datePhrase = cStart && cEnd
        ? (cStart === cEnd ? `around <strong>${cStart}</strong>` : `between <strong>${cStart}</strong> and <strong>${cEnd}</strong>`)
        : `across <strong>${formatHumanReadableDate(windowInfo.startDate)} to ${formatHumanReadableDate(windowInfo.endDate)}</strong>`;

    let intro = "";
    let scenarios = [];

    if (tabKey === "week") {
        intro = `During this upcoming week (${datePhrase}), short-term mood swings and everyday rush can create avoidable snags:`;
        scenarios = [
            "<strong>Quick Temper & Snap Replies:</strong> A tired mood or crowded schedule can make you react sharply to a minor remark—pause before answering messages or family questions.",
            "<strong>Commute, Queue & Errand Delays:</strong> Traffic slowdowns, misheard timings, or misplaced items are more likely on busy days—leave extra travel buffer and double-check details.",
            "<strong>Impulse Day Spending:</strong> Buying small extras out of stress or boredom adds up fast this week—hold off on non-essential purchases for a day."
        ];
    } else if (tabKey === "month") {
        intro = `Across this monthly cycle (${datePhrase}), watch for recurring monthly friction around money, routines, and close relationships:`;
        scenarios = [
            "<strong>Monthly Budget & Bill Creep:</strong> Recurring expenses, household repairs, or sudden commitments can stretch your cash flow if you don't track outflows early in the month.",
            "<strong>Workload & Follow-Up Bottlenecks:</strong> Delays from colleagues, clients, or approvals may test your patience—keep clear written records and avoid forcing rushed conclusions.",
            "<strong>Domestic & Relationship Tension:</strong> Unspoken expectations or old misunderstandings can resurface at home or with a partner—address issues calmly before resentment builds."
        ];
    } else {
        intro = `Over the broader 12-month stretch (${datePhrase}), larger cycles can bring deeper tests of patience, commitments, and stamina:`;
        scenarios = [
            "<strong>Major Commitments & Asset Moves:</strong> Avoid locking into big loans, property/vehicle deals, or high-stakes partnerships out of urgency—verify terms and long-term sustainability first.",
            "<strong>Burnout & Health Neglect:</strong> Pushing through months of mental pressure or irregular sleep can trigger chronic fatigue, acidity, or stress strain—pace your year in phases.",
            "<strong>Relationship & Loyalty Shifts:</strong> Longer-term tests around trust, boundaries, or changing priorities may surface—stay steady and don't make permanent decisions during temporary anger."
        ];
    }

    return `<p style="margin: 0 0 10px 0; font-size: 0.94rem; line-height: 1.65;">${intro}</p>` +
        `<ul style="margin: 0; padding-left: 18px; font-size: 0.93rem; line-height: 1.65; color: #e2e8f0;">` +
        scenarios.map(item => `<li style="margin-bottom: 6px;">${item}</li>`).join("") +
        `</ul>`;
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
        roleBody = `<strong>Profile Note (${natureRaw}):</strong> ${roleBody}`;
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
            `<p style="margin: 0 0 8px 0;"><strong>Gold:</strong> ${METALS_MARKET_OUTLOOK.goldNote} ${timingLine}</p>` +
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
    const spanText = `${formatHumanReadableDate(windowInfo.startDate)} to ${formatHumanReadableDate(windowInfo.endDate)}`;
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
            html: `<p style="margin: 0;"><strong>Gold:</strong> ${METALS_MARKET_OUTLOOK.goldNote}<br><strong>Silver:</strong> ${METALS_MARKET_OUTLOOK.silverNote}</p>`
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
    const cacheKey = `${profile.inputs?.date || "user"}_${profile.rasi?.number || 0}_${tabKey}_${getFormattedCurrentDate()}`;
    if (tabCache.has(cacheKey)) {
        return tabCache.get(cacheKey);
    }

    const windowInfo = resolveDateWindowForTab(tabKey);
    const spanText = `${formatHumanReadableDate(windowInfo.startDate)} to ${formatHumanReadableDate(windowInfo.endDate)}`;

    let html = "";
    let title = "";

    if (tabKey === "general") {
        const generalSections = buildGeneralSections(tabKey, windowInfo);
        title = "General & Macro Outlook";
        html += `<h2 style="color: #ffd700; border-bottom: 1px solid rgba(255,215,0,0.3); padding-bottom: 8px; margin-top: 0;">General & Macro Outlook</h2>`;
        html += `<div style="font-size: 0.9rem; color: #caa437; font-weight: bold; margin-bottom: 14px;">GENERAL • ${spanText}</div>`;
        generalSections.forEach((sec, idx) => {
            html += renderPredictionBlockWithBottomDivider(
                sec.title,
                sec.html,
                idx === generalSections.length - 1,
                "rgba(202, 164, 55, 0.35)"
            );
        });
    } else {
        const transitData = await analyzeTransitsForWindow(profile, windowInfo);
        const personalSections = buildPersonalSections(profile, tabKey, windowInfo, transitData);

        title = `${tabKey.toUpperCase()} Astrological Report`;
        html += `<h2 style="color: #ffd700; border-bottom: 1px solid rgba(255,215,0,0.3); padding-bottom: 8px; margin-top: 0;">Combined Multi-Tradition Forecast</h2>`;
        html += `<div style="font-size: 0.9rem; color: #caa437; font-weight: bold; margin-bottom: 14px;">${tabKey.toUpperCase()} (${windowInfo.label}) • ${spanText}</div>`;

        if (transitData.retrogradeWindows.length > 0) {
            const shiftLines = transitData.retrogradeWindows.map(r => {
                const domainProfile = SHIFT_DOMAIN_PROFILES[r.key] || {
                    title: "Life & Daily Rhythm",
                    advice: "Slow down external rush and double-check key details before moving ahead."
                };
                const rangeStr = formatHumanReadableDate(r.start) === formatHumanReadableDate(r.end)
                    ? formatHumanReadableDate(r.start)
                    : `${formatHumanReadableDate(r.start)} to ${formatHumanReadableDate(r.end)}`;
                return `<div style="font-size: 0.92rem; color: #fef3c7; margin-top: 4px;">• <strong>${domainProfile.title}</strong> (${rangeStr}): ${domainProfile.advice}</div>`;
            }).join("");

            html += renderPredictionBlockWithBottomDivider(
                "🔄 Focus & Review Windows Active",
                shiftLines,
                false,
                "rgba(251, 191, 36, 0.35)"
            );
        }

        personalSections.forEach(sec => {
            html += renderPredictionBlockWithBottomDivider(
                sec.title,
                sec.html,
                false,
                "rgba(255, 215, 0, 0.24)"
            );
        });

        html += renderPredictionBlockWithBottomDivider(
            "Caution Window & Possible Incidents",
            buildHorizonSpecificCautionHtml(tabKey, windowInfo, transitData),
            true,
            "rgba(255, 215, 0, 0.24)"
        );
    }

    const result = { html, title, windowInfo };
    tabCache.set(cacheKey, result);
    return result;
}

async function activateAndRenderTab(tabKey) {
    currentActiveTab = tabKey;
    syncReportButtonForTab(tabKey);

    document.querySelectorAll(".horizon-tab-btn").forEach(btn => {
        btn.classList.toggle("active-horizon-tab", btn.dataset.tab === tabKey);
    });

    const panel = document.getElementById("tabDisplayPanel");
    if (!panel || !currentBirthProfile) return;

    panel.innerHTML = `<div style="color: #ffd700; font-size: 0.9rem;">Calculating ${tabKey.toUpperCase()} forecast...</div>`;
    const result = await generateReportForTab(currentBirthProfile, tabKey);
    panel.innerHTML = result.html;
}

function showPredictionModal(title, htmlContent) {
    const modal = document.getElementById("predictionModalOverlay");
    const modalTitle = document.getElementById("modalTitle");
    const modalBody = document.getElementById("modalBodyContent");

    if (modal && modalTitle && modalBody) {
        modalTitle.innerText = title;
        modalBody.innerHTML = htmlContent;
        modal.style.display = "flex";
    }
}

function closePredictionModal() {
    const modal = document.getElementById("predictionModalOverlay");
    if (modal) modal.style.display = "none";
}

function displayFullReport(profile) {
    const profileKey = profile.inputs?.date || "user";
    const reportItems = getStoredReport(profileKey);

    if (reportItems.length === 0) {
        showPredictionModal("Saved Report Ledger", "No reports generated yet. Click Generate Report on a forecast tab to save one.");
        return;
    }

    let ledgerHtml = `<div style="text-align: right; margin-bottom: 10px;">` +
        `<button id="clearReportBtn" class="btn" style="background: #a83232; color: #fff; padding: 4px 10px; font-size: 0.8rem; border-radius: 4px; cursor: pointer;">Clear Ledger</button>` +
        `</div>`;

    reportItems.forEach((item, index) => {
        ledgerHtml += `<div style="margin-bottom: 20px; padding: 15px; background: rgba(0,0,0,0.35); border: 1px solid rgba(255,215,0,0.2); border-radius: 6px;">`;
        ledgerHtml += `<div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: #ffd700; margin-bottom: 8px; border-bottom: 1px solid rgba(255,215,0,0.1); padding-bottom: 4px;">`;
        ledgerHtml += `<span>Report ${index + 1}: [${item.topic.toUpperCase()}] • [${item.method.toUpperCase()}]</span>`;
        ledgerHtml += `<span>${new Date(item.timestamp).toLocaleDateString()}</span>`;
        ledgerHtml += `</div>`;
        ledgerHtml += `<div style="font-size: 0.95rem; line-height: 1.6;">${item.content}</div>`;
        ledgerHtml += `</div>`;
    });

    showPredictionModal("Saved Report Ledger", ledgerHtml);

    setTimeout(() => {
        document.getElementById("clearReportBtn")?.addEventListener("click", () => {
            if (confirm("Are you sure you want to clear all saved reports?")) {
                clearStoredReport(profileKey);
                closePredictionModal();
            }
        });
    }, 100);
}

function downloadReportAsTxt(profile) {
    const profileKey = profile.inputs?.date || "user";
    const reportItems = getStoredReport(profileKey);

    if (reportItems.length === 0) {
        alert("No report data available to save.");
        return;
    }

    let fullText = "NAKSHATRA GUIDE - REPORT LEDGER\n";
    fullText += `Generated on: ${new Date().toLocaleDateString()}\n`;
    fullText += "==================================================\n\n";

    reportItems.forEach((item, index) => {
        fullText += `--- SECTION ${index + 1}: ${item.topic.toUpperCase()} (${item.method.toUpperCase()}) ---\n\n`;
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = item.content;
        fullText += tempDiv.textContent || tempDiv.innerText || "";
        fullText += "\n\n--------------------------------------------------\n\n";
    });

    const blob = new Blob([fullText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Nakshatra_Report_${getFormattedCurrentDate()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

async function loadStoredProfileAndRender() {
    try {
        const storedData = localStorage.getItem("permanentBirthProfile");
        if (!storedData) {
            setProfileViewMode(false);
            updateForecastSuiteHeader(null);
            return;
        }

        const profile = JSON.parse(storedData);
        currentBirthProfile = profile;

        if (!profile.nakshatra || (profile.hour === undefined && profile.birthHour === undefined && profile.inputs?.hour === undefined)) {
            localStorage.removeItem("permanentBirthProfile");
            setProfileViewMode(false);
            updateForecastSuiteHeader(null);
            return;
        }

        clearTabCache();
        setProfileViewMode(true);
        updateForecastSuiteHeader(profile);
        syncReportButtonForTab(currentActiveTab);
        const profileKey = profile.inputs?.date || "user";
        updateReportBadgeCount(getStoredReport(profileKey).length);
        await activateAndRenderTab(currentActiveTab);
    } catch (err) {
        console.error("Profile auto-load failed:", err);
        localStorage.removeItem("permanentBirthProfile");
        setProfileViewMode(false);
        updateForecastSuiteHeader(null);
    }
}

async function handleSubmit() {
    const dobInput = document.getElementById("dob").value;
    const tobValue = document.getElementById("tob").value;
    const genderValue = document.getElementById("genderSelect")?.value || "unspecified";
    const occupationStatus = document.getElementById("occupationStatusSelect")?.value || "working";
    const workNature = document.getElementById("workNatureInput")?.value.trim() || "";
    const houseStatus = document.getElementById("houseStatusSelect")?.value || "own";
    const vehicleStatus = document.getElementById("vehicleStatusSelect")?.value || "own";
    const placeValue = document.getElementById("birth-place-input")?.value || "";
    const countryValue = document.getElementById("country-input")?.value || "";

    try {
        if (!dobInput || dobInput.length < 10) throw new Error("Please enter a valid Date of Birth (DD-MM-YYYY).");
        if (!tobValue) throw new Error("Please select your Time of Birth.");

        const [day, month, year] = dobInput.split("-").map(Number);
        if (isNaN(day) || isNaN(month) || isNaN(year) || month < 1 || month > 12 || day < 1 || day > 31) {
            throw new Error("Invalid date components. Use DD-MM-YYYY format.");
        }

        const [hour, minute] = tobValue.split(":").map(Number);
        let resolvedTimezone = -(new Date().getTimezoneOffset() / 60);
        const normalizedCity = placeValue.trim().toLowerCase();

        if (GLOBAL_CITY_TZ_DB[normalizedCity] !== undefined) {
            resolvedTimezone = GLOBAL_CITY_TZ_DB[normalizedCity];
        }

        const inputPayload = { year, month, day, hour, minute, timezone: resolvedTimezone };
        currentBirthProfile = await getBirthData(inputPayload);

        currentBirthProfile.inputs = {
            date: dobInput,
            time: tobValue,
            gender: genderValue,
            occupationStatus,
            workNature,
            houseStatus,
            vehicleStatus,
            place: placeValue,
            country: countryValue,
            year, month, day, hour, minute,
            timezone: resolvedTimezone
        };

        document.getElementById("detectedNakshatra").innerText = `${currentBirthProfile.nakshatra.name}`;
        document.getElementById("detectedPada").innerText = `Pada ${currentBirthProfile.pada.number}`;
        if (document.getElementById("vedicRasi")) document.getElementById("vedicRasi").innerText = currentBirthProfile.rasi.name;
        if (document.getElementById("westernZodiac")) document.getElementById("westernZodiac").innerText = currentBirthProfile.zodiac.name;

        document.getElementById("submitBtn").style.display = "none";
        document.getElementById("confirmBtn").style.display = "inline-block";
        document.getElementById("rejectBtn").style.display = "inline-block";

    } catch (err) {
        document.getElementById("detectedNakshatra").innerText = err.message;
        document.getElementById("detectedPada").innerText = "";
        document.getElementById("confirmBtn").style.display = "none";
        document.getElementById("rejectBtn").style.display = "none";
        document.getElementById("submitBtn").style.display = "inline-block";
    }
}

async function handleConfirm() {
    if (!currentBirthProfile) return;

    try {
        clearTabCache();
        localStorage.setItem("permanentBirthProfile", JSON.stringify(currentBirthProfile));
        setProfileViewMode(true);
        updateForecastSuiteHeader(currentBirthProfile);
        await activateAndRenderTab(currentActiveTab);
    } catch (err) {
        alert("Error executing profile save: " + err.message);
    }
}

function handleReject() {
    currentBirthProfile = null;
    document.getElementById("confirmBtn").style.display = "none";
    document.getElementById("rejectBtn").style.display = "none";
    document.getElementById("submitBtn").style.display = "inline-block";
    document.getElementById("detectedNakshatra").innerText = "Waiting for Birth Details";
    document.getElementById("detectedPada").innerText = "";
    if (document.getElementById("vedicRasi")) document.getElementById("vedicRasi").innerText = "-";
    if (document.getElementById("westernZodiac")) document.getElementById("westernZodiac").innerText = "-";
}

function handleReset() {
    clearTabCache();
    localStorage.removeItem("permanentBirthProfile");
    currentBirthProfile = null;
    window.location.reload();
}

document.addEventListener("DOMContentLoaded", () => {
    loadStoredProfileAndRender();

    document.getElementById("submitBtn")?.addEventListener("click", handleSubmit);
    document.getElementById("confirmBtn")?.addEventListener("click", handleConfirm);
    document.getElementById("rejectBtn")?.addEventListener("click", handleReject);
    document.getElementById("resetProfileLink")?.addEventListener("click", handleReset);

    document.querySelectorAll(".horizon-tab-btn").forEach(btn => {
        btn.addEventListener("click", () => activateAndRenderTab(btn.dataset.tab));
    });

    document.getElementById("closeModalBtn")?.addEventListener("click", closePredictionModal);
    document.getElementById("modalCloseActionBtn")?.addEventListener("click", closePredictionModal);

    const openAdmin = () => openTranscriptAdminModal(() => {
        clearTabCache();
        activateAndRenderTab(currentActiveTab);
    });
    document.getElementById("hiddenOwnerTrigger")?.addEventListener("click", openAdmin);
    window.openTranscriptAdmin = openAdmin;
    document.addEventListener("keydown", (e) => {
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "t") {
            e.preventDefault();
            openAdmin();
        }
    });

    document.getElementById("modalDeleteReportBtn")?.addEventListener("click", () => {
        if (confirm("Are you sure you want to delete this report and start fresh?")) {
            if (currentBirthProfile) {
                const profileKey = currentBirthProfile.inputs?.date || "user";
                clearStoredReport(profileKey);
            }
            closePredictionModal();
        }
    });

    document.getElementById("modalSaveReportBtn")?.addEventListener("click", () => {
        if (currentBirthProfile) {
            downloadReportAsTxt(currentBirthProfile);
        }
    });

    document.getElementById("generateInsightBtn")?.addEventListener("click", async () => {
        if (!currentBirthProfile || currentActiveTab === "general") return;
        const btn = document.getElementById("generateInsightBtn");
        const originalText = btn.innerText;
        btn.innerText = "Generating Report...";
        btn.disabled = true;

        try {
            const result = await generateReportForTab(currentBirthProfile, currentActiveTab);
            const profileKey = currentBirthProfile.inputs?.date || "user";
            logPredictionToReport(profileKey, COMBINED_METHOD_KEY, `${currentActiveTab.toUpperCase()} Forecast`, getFormattedCurrentDate(), result.html);
            showPredictionModal(result.title, result.html);
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    });

    document.getElementById("viewCompleteReportBtn")?.addEventListener("click", () => {
        if (!currentBirthProfile) return;
        displayFullReport(currentBirthProfile);
    });

    const dobInput = document.getElementById("dob");
    if (dobInput) {
        dobInput.addEventListener("input", (e) => {
            let v = e.target.value.replace(/\D/g, '');
            let formattedValue = '';
            if (v.length > 0) {
                formattedValue = v.slice(0, 2);
                if (v.length > 2) formattedValue += '-' + v.slice(2, 4);
                if (v.length > 4) formattedValue += '-' + v.slice(4, 8);
            }
            e.target.value = formattedValue;
            if (v.length === 8) {
                setTimeout(() => document.getElementById("tob")?.focus(), 10);
            }
        });
    }

    const tobInput = document.getElementById("tob");
    if (tobInput) {
        tobInput.addEventListener("change", () => {
            if (tobInput.value && tobInput.value.length === 5) {
                document.getElementById("birth-place-input")?.focus();
            }
        });
    }
});