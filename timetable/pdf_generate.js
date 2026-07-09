// --- pdf_generate.js ---

export function generatePdfTimetable(currentWeekEvents, globalSubjectsCache, showToastCallback) {
    if (!currentWeekEvents || currentWeekEvents.length === 0) {
        if(showToastCallback) showToastCallback("Nincs letölthető órarend ezen a héten.", "warning");
        return;
    }

    const days = {1: [], 2: [], 3: [], 4: [], 5: []};
    const boundaries = new Set(); // Eltároljuk azokat az órákat, ahol "törés" van

    // 1. Események feldolgozása
    currentWeekEvents.forEach(ev => {
        if (!ev.start || !ev.start.dateTime) return;
        const startD = new Date(ev.start.dateTime);
        const endD = new Date(ev.end.dateTime);
        const day = startD.getDay();

        if (day >= 1 && day <= 5) {
            let s = Math.round(startD.getHours() + startD.getMinutes() / 60);
            let e = Math.round(endD.getHours() + endD.getMinutes() / 60);
            
            if (e <= 8 || s >= 20) return; 
            s = Math.max(8, s);
            e = Math.min(20, e);

            boundaries.add(s);
            boundaries.add(e);

            let summary = ev.summary || ''; let type = 'Előadás';
            if (summary.includes('(')) {
                const parts = summary.split('(');
                summary = parts[0].trim();
                type = parts[1].replace(')', '').trim();
            }

            days[day].push({ start: s, end: e, summary, type, location: ev.location || '' });
        }
    });

    // Párhuzamos órák sávokra bontása
    for (let d = 1; d <= 5; d++) {
        days[d].sort((a, b) => a.start - b.start);
        const tracks = [];
        days[d].forEach(ev => {
            let placed = false;
            for (let i = 0; i < tracks.length; i++) {
                if (ev.start >= tracks[i][tracks[i].length - 1].end) {
                    tracks[i].push(ev); ev.track = i; placed = true; break;
                }
            }
            if (!placed) { tracks.push([ev]); ev.track = tracks.length - 1; }
        });
        days[d].maxTracks = tracks.length || 1;
    }

    // 2. HTML felépítése a nyomtatáshoz
    let html = `
    <!DOCTYPE html>
    <html lang="hu">
    <head>
        <meta charset="UTF-8">
        <title>Heti Órarend</title>
        <style>
            @page { size: landscape; margin: 15mm; }
            body { 
                font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
                background-color: #1a1d24; 
                color: #ffffff; 
                margin: 0; 
                padding: 0;
                -webkit-print-color-adjust: exact !important; 
                print-color-adjust: exact !important; 
            }
            h2 { text-align: center; margin-bottom: 20px; font-weight: 600; letter-spacing: 1px; }
            table { 
                width: 100%; 
                border-collapse: collapse; 
                table-layout: fixed; /* Ez kényszeríti ki az egyforma oszlopszélességet! */
            }
            th, td { 
                border: 1px solid #4a525d; 
                text-align: center; 
                vertical-align: middle; 
                padding: 8px 4px; 
                overflow: hidden; 
                word-wrap: break-word; 
            }
            th { background-color: #0f1115; font-size: 13px; font-weight: 600; padding: 12px 4px; }
            .day-header { background-color: #262a33; font-weight: bold; font-size: 14px; width: 8%; }
            .empty-cell { background-color: #262a33; border: 1px solid #4a525d; }
            .event-cell { border: 1px solid rgba(255,255,255,0.2); }
            .event-title { font-weight: 700; font-size: 12px; line-height: 1.2; display: block; margin-bottom: 3px; }
            .event-type { font-weight: 400; font-size: 11px; font-style: italic; display: block; opacity: 0.9; }
            .event-loc { font-weight: 400; font-size: 10px; display: block; margin-top: 4px; opacity: 0.8; }
        </style>
    </head>
    <body>
        <h2>ÓRAREND</h2>
        <table>
            <thead>
                <tr>
                    <th class="day-header">Nap</th>`;

    // Fejléc logika: 2 órás léptek, kivéve ha "törés" (páratlan órás esemény) van benne
    for (let h = 8; h < 20; h += 2) {
        if (boundaries.has(h + 1)) {
            html += `<th colspan="1" style="width: 7.66%;">${h}-${h+1}</th>`;
            html += `<th colspan="1" style="width: 7.66%;">${h+1}-${h+2}</th>`;
        } else {
            html += `<th colspan="2" style="width: 15.33%;">${h}-${h+2}</th>`;
        }
    }

    html += `   </tr>
            </thead>
            <tbody>`;

    const dayNames = {1: 'Luni', 2: 'Marți', 3: 'Miercuri', 4: 'Joi', 5: 'Vineri'};

    // Táblázat testének felépítése
    for (let d = 1; d <= 5; d++) {
        const tracksCount = days[d].maxTracks;

        for (let t = 0; t < tracksCount; t++) {
            html += `<tr>`;
            
            if (t === 0) {
                html += `<td class="day-header" rowspan="${tracksCount}">${dayNames[d]}</td>`;
            }

            let h = 8;
            while (h < 20) {
                const ev = days[d].find(e => e.track === t && e.start === h);
                if (ev) {
                    const duration = ev.end - ev.start;
                    const cacheKey = `${ev.summary}_${ev.type}`.toLowerCase();
                    const bg = globalSubjectsCache[cacheKey] ? globalSubjectsCache[cacheKey].color : '#3b82f6';
                    
                    html += `
                        <td class="event-cell" colspan="${duration}" style="background-color: ${bg};">
                            <span class="event-title">${ev.summary}</span>
                            <span class="event-type">${ev.type}</span>
                            ${ev.location ? `<span class="event-loc">📍 ${ev.location}</span>` : ''}
                        </td>`;
                    h += duration;
                } else {
                    html += `<td class="empty-cell" colspan="1"></td>`;
                    h += 1;
                }
            }
            html += `</tr>`;
        }
    }

    html += `
            </tbody>
        </table>
    </body>
    </html>`;

    if(showToastCallback) showToastCallback("Nyomtatási nézet előkészítése...", "success");

    // 3. Rejtett iframe létrehozása a nyomtatáshoz
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    // Várunk egy pillanatot, amíg a böngésző értelmezi a stílusokat, majd megnyitjuk a PDF mentés/nyomtatás ablakot
    setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        
        // Takarítás a nyomtatási ablak bezárása után
        setTimeout(() => {
            document.body.removeChild(iframe);
        }, 1000);
    }, 250);
}