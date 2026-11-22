// js/report_manager.js

export function logPredictionToReport(profileKey, method, topic, dateStr, content) {
    const storageKey = `astrology_report_${profileKey || 'default'}001`;
    let existingReport = [];
    
    try {
        const raw = localStorage.getItem(storageKey);
        if (raw) existingReport = JSON.parse(raw);
    } catch(e) {
        existingReport = [];
    }

    existingReport.push({
        id: Date.now(),
        method: method,
        topic: topic,
        date: dateStr,
        content: content,
        timestamp: new Date().toISOString()
    });

    localStorage.setItem(storageKey, JSON.stringify(existingReport));
    updateReportBadgeCount(existingReport.length);
}

export function getStoredReport(profileKey) {
    const storageKey = `astrology_report_${profileKey || 'default'}001`;
    try {
        const raw = localStorage.getItem(storageKey);
        return raw ? JSON.parse(raw) : [];
    } catch(e) {
        return [];
    }
}

export function clearStoredReport(profileKey) {
    const storageKey = `astrology_report_${profileKey || 'default'}001`;
    localStorage.removeItem(storageKey);
    updateReportBadgeCount(0);
}

export function updateReportBadgeCount(count) {
    const badge = document.getElementById("reportCountBadge");
    if (badge) badge.innerText = count;
}