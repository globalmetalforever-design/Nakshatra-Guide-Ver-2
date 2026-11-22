import { getBirthData } from "./birth_engine.js?v=103";
import { generateTimeLockedForecast as generateDailyForecast } from "../Addons/js/time_lock_addon.js?v=132";

let currentBirthProfile = null;

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

function setProfileViewMode(hasStoredProfile) {
    const newUserDataRow = document.getElementById("newUserDataRow");
    const forecastContainer = document.getElementById("forecastContainer");

    if (hasStoredProfile) {
        if (newUserDataRow) newUserDataRow.style.display = "none";
        if (forecastContainer) forecastContainer.style.display = "block";
    } else {
        if (newUserDataRow) {
            newUserDataRow.style.display = "grid";
            newUserDataRow.style.gridTemplateColumns = (window.innerWidth > 768) ? "1fr 1fr" : "1fr";
        }
        if (forecastContainer) forecastContainer.style.display = "none";
    }
}

function getFormattedCurrentDate(dateObj = new Date()) {
    const dd = String(dateObj.getDate()).padStart(2, '0');
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const yyyy = dateObj.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
}

function buildHumanPersonalForecast(profile, targetDate = new Date()) {
    const nakshatraName = profile.nakshatra?.name || "your birth star";
    const rasiName = profile.rasi?.name || "your moon sign";
    const dayOfWeek = targetDate.getDay();

    const toneVariations = [
        `For ${nakshatraName} (${rasiName}), there is a quiet, steady undercurrent today that rewards patience over rushing. You may feel a strong urge to steer things on your own terms, yet softening your guard and listening closely before reacting keeps unnecessary friction away. Give yourself room to breathe and let real clarity settle before making big moves.`,
        `With ${nakshatraName} (${rasiName}) in mind today, your inner drive is active, though carrying too many worries or trying to fix everything at once can leave your mind feeling stretched. A calm word, honest patience, and pacing your energy through the day will help you stay centered and avoid feeling worn down.`,
        `Today carries a thoughtful, grounding feel for ${nakshatraName} (${rasiName}). Even if small delays or shifting moods test your patience, you have the steadiness to handle them without losing your footing. Focus on what genuinely matters to your heart and home, and avoid letting hasty impulses pull you off balance.`
    ];

    return toneVariations[dayOfWeek % toneVariations.length];
}

async function renderUserDashboard(storedBirthProfile, targetDate = new Date()) {
    try {
        const dynamicForecast = await generateDailyForecast(storedBirthProfile, targetDate);

        const forecastBox = document.getElementById("forecastBox");
        if (forecastBox) {
            forecastBox.style.setProperty("color", "#e2e8f0", "important");
            const baseText = dynamicForecast?.forecast || "";
            const humanTouch = buildHumanPersonalForecast(storedBirthProfile, targetDate);
            forecastBox.innerHTML = baseText
                ? `<p style="margin: 0 0 12px 0;">${baseText}</p><p style="margin: 0;">${humanTouch}</p>`
                : `<p style="margin: 0;">${humanTouch}</p>`;
        }

        const dateBadge = document.getElementById("forecastDateBadge");
        if (dateBadge) {
            dateBadge.innerText = getFormattedCurrentDate(targetDate);
        }

        if (document.getElementById("luckyColor")) {
            document.getElementById("luckyColor").innerText = dynamicForecast?.guidance?.luckyColor || "-";
        }
        if (document.getElementById("goodTime")) {
            document.getElementById("goodTime").innerText = dynamicForecast?.guidance?.goodTime || "-";
        }
        if (document.getElementById("badTime")) {
            document.getElementById("badTime").innerText = dynamicForecast?.guidance?.badTime || "-";
        }
    } catch (error) {
        console.error("Dashboard render failed:", error);
        const forecastBox = document.getElementById("forecastBox");
        if (forecastBox) {
            forecastBox.style.setProperty("color", "#e2e8f0", "important");
            forecastBox.innerHTML = `<p style="margin: 0;">${buildHumanPersonalForecast(storedBirthProfile, targetDate)}</p>`;
        }
    }
}

async function loadStoredProfileAndRender() {
    try {
        const storedData = localStorage.getItem("permanentBirthProfile");
        if (!storedData) {
            setProfileViewMode(false);
            return;
        }

        const profile = JSON.parse(storedData);
        currentBirthProfile = profile;

        if (!profile.nakshatra || (profile.hour === undefined && profile.birthHour === undefined && profile.inputs?.hour === undefined)) {
            localStorage.removeItem("permanentBirthProfile");
            setProfileViewMode(false);
            return;
        }

        setProfileViewMode(true);
        await renderUserDashboard(profile, new Date());
    } catch (err) {
        console.error("Profile auto-load failed:", err);
        localStorage.removeItem("permanentBirthProfile");
        setProfileViewMode(false);
    }
}

async function handleSubmit() {
    const dobInput = document.getElementById("dob").value;
    const tobValue = document.getElementById("tob").value;
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
        localStorage.setItem("permanentBirthProfile", JSON.stringify(currentBirthProfile));
        setProfileViewMode(true);
        await renderUserDashboard(currentBirthProfile, new Date());
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