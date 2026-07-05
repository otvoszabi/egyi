// --- FIREBASE BEÁLLÍTÁSOK ÉS IMPORTÁLÁS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyBjofFZckWumoJR0oubhM7Xh7Era1lF8QU",
    authDomain: "egyi-18050.firebaseapp.com",
    databaseURL: "https://egyi-18050-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "egyi-18050",
    storageBucket: "egyi-18050.firebasestorage.app",
    messagingSenderId: "237004207210",
    appId: "1:237004207210:web:00f4165b81c89033510613",
    measurementId: "G-GH0CWZ7LDL"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const dbRef = ref(db, 'jelenlet_app_data');


// --- ADATBÁZIS ÁLLAPOTOK ---
let subjects = [];
let currentMainModule = 1;     
let newSubjectModule = 1;      
let currentDetailId = null; 
let currentDetailType = null; 

// 1. Valós idejű felhős szinkronizálás (Ez tölti be és frissíti az adatokat)
onValue(dbRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
        // Ha a Firebase objektummá alakítaná a hiányos tömböt (törlés miatt), visszacsináljuk tömbbé
        let dataArray = Array.isArray(data) ? data : Object.values(data);
        
        // Betöltjük a felhőből, kiszűrjük a törölt (null) elemeket, és biztosítjuk a history tömböt
        subjects = dataArray.filter(s => s !== null).map(s => ({...s, history: s.history || []}));
    } else {
        // HA NINCS ADAT (Mert pl. kitörölted az utolsó tárgyat is)
        subjects = [];
    }
    
    // Frissítjük a képernyőt az új adatokkal
    renderUI();
    if (currentDetailId) {
        let subj = subjects.find(s => s.id === currentDetailId);
        if (subj) renderDetailContent(subj);
        else closeDetailModal(); // Ha valaki másik gépen kitörölte, az ablak bezárul
    }
});

// 2. Mentés a felhőbe (Ezt hívjuk meg minden pipálás és hozzáadás után)
function saveData() {
    set(dbRef, subjects);
}


// --- AZ EREDETI LOGIKÁD ÉS DIZÁJNOD INNENTŐL KEZDŐDIK ---

const iconBookBtn = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2h13.5A2.5 2.5 0 0 1 22.5 4.5v15A2.5 2.5 0 0 1 20 22H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>`;
const iconCapBtn = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10l-10-5-10 5 10 5 10-5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path><path d="M22 10v9"></path></svg>`;

function hexToRgb(hex) {
    let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : {r: 0, g: 0, b: 0};
}

// --- MODALOK NYITÁSA/ZÁRÁSA ---
function openModal() { document.getElementById('addModal').classList.add('show'); }
function closeModal() { document.getElementById('addModal').classList.remove('show'); }
function closeDetailModal() { document.getElementById('detailModal').classList.remove('show'); currentDetailId = null; }
function closeConfirmDeleteModal() { document.getElementById('confirmDeleteModal').classList.remove('show'); }

// MÓDOSÍTÁS MODAL FUNKCIÓK
function openEditModal() {
    if (!currentDetailId) return;
    let subj = subjects.find(s => s.id === currentDetailId);
    
    // Betöltjük a mezőkbe a jelenlegi értékeket
    document.getElementById('editSubjName').value = subj.name;
    document.getElementById('editLCount').value = subj.lecT;
    document.getElementById('editPCount').value = subj.pracT;
    document.getElementById('editColorPicker').value = subj.color;
    
    document.getElementById('editModal').classList.add('show');
}
function closeEditModal() { 
    document.getElementById('editModal').classList.remove('show'); 
}

// ÚJ: MENTÉS MEGERŐSÍTÉSE MODAL FUNKCIÓK
function promptSaveEditSubject() {
    document.getElementById('confirmSaveModal').classList.add('show');
}
function closeConfirmSaveModal() {
    document.getElementById('confirmSaveModal').classList.remove('show');
}

// Eseménykezelők a háttérre kattintáshoz
document.getElementById('addModal').addEventListener('click', function(e) { if (e.target === this) closeModal(); });
document.getElementById('detailModal').addEventListener('click', function(e) { if (e.target === this) closeDetailModal(); });
document.getElementById('confirmDeleteModal').addEventListener('click', function(e) { if (e.target === this) closeConfirmDeleteModal(); });
document.getElementById('editModal').addEventListener('click', function(e) { if (e.target === this) closeEditModal(); });
document.getElementById('confirmSaveModal').addEventListener('click', function(e) { if (e.target === this) closeConfirmSaveModal(); });

document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeModal();
        closeDetailModal();
        closeConfirmDeleteModal();
        closeEditModal();
        closeConfirmSaveModal();
    }
});

// --- FŐOLDAL LOGIKA ---
function switchMainModule(modNum) {
    currentMainModule = modNum;
    let tabs = document.querySelectorAll('.main-tab');
    tabs.forEach((tab, index) => {
        tab.classList.toggle('active', index + 1 === modNum);
    });
    renderUI(); 
}

function renderUI() {
    let container = document.getElementById('module-content');
    if(!container) return;
    container.innerHTML = ''; 

    let currentSubjects = subjects.filter(s => s.moduleId === currentMainModule);

    if(currentSubjects.length === 0) {
        container.innerHTML = '<p style="color: #94a3b8; margin-top: 10px;">Ebben a modulban még nincsenek tantárgyak.</p>';
        return;
    }

    currentSubjects.forEach(s => {
        let lecA = s.history.filter(h => h.type === 'lec').length;
        let pracA = s.history.filter(h => h.type === 'prac').length;

        let lPct = Math.min((lecA / s.lecT) * 100, 100);
        let pPct = Math.min((pracA / s.pracT) * 100, 100);
        
        let lClass = lPct >= 50 ? 'success' : '';
        let pClass = pPct === 100 ? 'success' : '';
        
        let lOffset = 125.66 - ((lPct / 100) * 125.66);
        let pOffset = 125.66 - ((pPct / 100) * 125.66);

        let rgb = hexToRgb(s.color);
        let dynamicStyles = `--card-text: ${s.color}; --card-bg: rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.05); --card-border: rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15);`;

        container.innerHTML += `
            <div class="card" style="${dynamicStyles}">
                <h2>${s.name}</h2>
                
                <div class="gauges-wrapper">
                    <div class="gauge-box">
                        <svg viewBox="0 0 100 55" class="gauge-svg">
                            <path class="gauge-bg" d="M 10 50 A 40 40 0 0 1 90 50" />
                            <path class="gauge-fill ${lClass}" d="M 10 50 A 40 40 0 0 1 90 50" style="stroke-dashoffset: ${lOffset};" />
                        </svg>
                        <div class="gauge-text ${lClass}">${lecA}/${s.lecT}</div>
                        <div class="gauge-label">Előadás</div>
                    </div>

                    <div class="gauge-box">
                        <svg viewBox="0 0 100 55" class="gauge-svg">
                            <path class="gauge-bg" d="M 10 50 A 40 40 0 0 1 90 50" />
                            <path class="gauge-fill ${pClass}" d="M 10 50 A 40 40 0 0 1 90 50" style="stroke-dashoffset: ${pOffset};" />
                        </svg>
                        <div class="gauge-text ${pClass}">${pracA}/${s.pracT}</div>
                        <div class="gauge-label">Gyakorlat</div>
                    </div>
                </div>

                <div class="card-actions">
                    <button class="card-btn" onclick="openDetail('${s.id}', 'lec')">${iconBookBtn} Előadás</button>
                    <button class="card-btn" onclick="openDetail('${s.id}', 'prac')">${iconCapBtn} Gyakorlat</button>
                </div>
            </div>
        `;
    });
}

// --- RÉSZLETES NÉZET, EXPORT, ÉS TÖRLÉS ---
function openDetail(id, typeToView) {
    currentDetailId = id;
    currentDetailType = typeToView;
    let subj = subjects.find(s => s.id === id);
    
    let titleEl = document.getElementById('detailTitle');
    titleEl.innerText = subj.name;
    titleEl.style.color = subj.color; 
    
    document.getElementById('lecSection').style.display = typeToView === 'lec' ? 'block' : 'none';
    document.getElementById('pracSection').style.display = typeToView === 'prac' ? 'block' : 'none';

    renderDetailContent(subj);
    document.getElementById('detailModal').classList.add('show');
}

function promptDeleteSubject() {
    if (!currentDetailId) return;
    let subj = subjects.find(s => s.id === currentDetailId);
    document.getElementById('confirmDeleteText').innerText = `Biztos törölni szeretnéd a(z) ${subj.moduleId}. modulos ${subj.name} tárgyat?`;
    document.getElementById('confirmDeleteModal').classList.add('show');
}

function executeDeleteSubject() {
    if (!currentDetailId) return;
    subjects = subjects.filter(s => s.id !== currentDetailId);
    
    saveData(); // MENTÉS TÖRLÉS UTÁN
    
    closeConfirmDeleteModal();
    closeDetailModal();
}

// ÚJ: TÉNYLEGES MENTÉS FÜGGVÉNYE A MEGERŐSÍTÉS UTÁN
function executeEditSave() {
    if (!currentDetailId) return;
    let subj = subjects.find(s => s.id === currentDetailId);
    
    let newName = document.getElementById('editSubjName').value.trim();
    let newLecT = parseInt(document.getElementById('editLCount').value);
    let newPracT = parseInt(document.getElementById('editPCount').value);
    let newColor = document.getElementById('editColorPicker').value;
    
    if (newName.length > 0) subj.name = newName;
    if (newLecT > 0) subj.lecT = newLecT;
    if (newPracT > 0) subj.pracT = newPracT;
    subj.color = newColor;
    
    saveData(); // Új adatok feltöltése a Firebase-be
    
    // Azonnal frissítjük a nyitva lévő részletes nézet fejlécét is
    let titleEl = document.getElementById('detailTitle');
    if (titleEl) {
        titleEl.innerText = subj.name;
        titleEl.style.color = subj.color;
    }
    
    renderUI(); 
    renderDetailContent(subj); 
    
    // Zárjuk be mindkét ablakot
    closeConfirmSaveModal();
    closeEditModal();
}

function exportToExcel() {
    if (!currentDetailId) return;
    let subj = subjects.find(s => s.id === currentDetailId);

    if (!subj.history || subj.history.length === 0) {
        alert("Ebben a tantárgyban még nincs rögzített jelenlét, amit le lehetne tölteni.");
        return;
    }

    let sortedHistory = [...subj.history].sort((a,b) => b.timestamp - a.timestamp);

    let dataToExport = sortedHistory.map(h => ({
        "Hét": h.week + ". hét",
        "Típus": h.type === 'lec' ? 'Előadás' : 'Gyakorlat',
        "Státusz": "Jelen",
        "Dátum": h.date,
        "Időpont": h.time
    }));

    let worksheet = XLSX.utils.json_to_sheet(dataToExport);
    let workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Jelenlét");

    let fileName = `${subj.name.replace(/\s+/g, '_')}_jelenletek.xlsx`;
    XLSX.writeFile(workbook, fileName);
}

function renderDetailContent(subj) {
    let checkSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    
    let lecHtml = '';
    for(let i=1; i<=subj.lecT; i++) {
        let isAttended = subj.history.some(h => h.type === 'lec' && h.week === i);
        lecHtml += `
            <div class="week-box ${isAttended ? 'attended' : ''}" onclick="toggleWeek('${subj.id}', 'lec', ${i})">
                <div class="circle">${isAttended ? checkSvg : ''}</div>
                <div class="num">${i}.</div>
            </div>
        `;
    }
    document.getElementById('detailLecGrid').innerHTML = lecHtml;

    let pracHtml = '';
    for(let i=1; i<=subj.pracT; i++) {
        let isAttended = subj.history.some(h => h.type === 'prac' && h.week === i);
        pracHtml += `
            <div class="week-box ${isAttended ? 'attended' : ''}" onclick="toggleWeek('${subj.id}', 'prac', ${i})">
                <div class="circle">${isAttended ? checkSvg : ''}</div>
                <div class="num">${i}.</div>
            </div>
        `;
    }
    document.getElementById('detailPracGrid').innerHTML = pracHtml;

    let filteredHistory = subj.history.filter(h => h.type === currentDetailType).sort((a,b) => b.timestamp - a.timestamp);
    let histHtml = '';
    
    if(filteredHistory.length === 0) {
        histHtml = `<tr><td colspan="5" style="text-align: center; color: #9ca3af; padding: 20px 0;">Még nincs rögzített jelenlét.</td></tr>`;
    } else {
        filteredHistory.forEach(h => {
            let typeName = h.type === 'lec' ? 'Előadás' : 'Gyakorlat';
            histHtml += `
                <tr>
                    <td>${h.week}.</td>
                    <td>${typeName}</td>
                    <td><span class="status-badge">Jelen</span></td>
                    <td>${h.date}</td>
                    <td>${h.time}</td>
                </tr>
            `;
        });
    }
    document.getElementById('detailHistoryBody').innerHTML = histHtml;
}

function toggleWeek(id, type, weekNum) {
    let subj = subjects.find(s => s.id === id);
    let existingIndex = subj.history.findIndex(h => h.type === type && h.week === weekNum);
    
    if(existingIndex > -1) {
        subj.history.splice(existingIndex, 1);
    } else {
        let now = new Date();
        let monthNames = ['jan.', 'febr.', 'márc.', 'ápr.', 'máj.', 'jún.', 'júl.', 'aug.', 'szept.', 'okt.', 'nov.', 'dec.'];
        let dateStr = `${now.getFullYear()}. ${monthNames[now.getMonth()]} ${now.getDate()}.`;
        let timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        
        subj.history.push({
            type: type,
            week: weekNum,
            date: dateStr,
            time: timeStr,
            timestamp: now.getTime()
        });
    }
    
    saveData(); // MENTÉS PIPÁLÁS UTÁN
}

// --- ÚJ TANTÁRGY ŰRLAP LOGIKA ---
function pickModalModule(modNum, btnElement) {
    newSubjectModule = modNum;
    let btns = document.querySelectorAll('#modalModBtnGroup .mod-btn');
    btns.forEach(btn => btn.classList.remove('active'));
    btnElement.classList.add('active');
}

function checkInput() {
    let name = document.getElementById('subjName').value.trim();
    let btn = document.getElementById('submitBtn');
    if (name.length > 0) { btn.disabled = false; btn.classList.add('ready'); } 
    else { btn.disabled = true; btn.classList.remove('ready'); }
}

function saveSubject() {
    let name = document.getElementById('subjName').value.trim();
    let lec = parseInt(document.getElementById('lCount').value) || 12;
    let prac = parseInt(document.getElementById('pCount').value) || 12;
    let chosenColor = document.getElementById('colorPicker').value;

    subjects.push({
        id: Math.random().toString(),
        name: name,
        moduleId: newSubjectModule,
        color: chosenColor,
        lecT: lec,
        pracT: prac,
        history: [] 
    });

    saveData(); // MENTÉS HOZZÁADÁS UTÁN

    document.getElementById('subjName').value = '';
    checkInput();
    closeModal();
    switchMainModule(newSubjectModule);
}

// =========================================================================
// KRITIKUS RÉSZ: Hozzárendeljük a függvényeket a HTML gombokhoz
// =========================================================================
window.openModal = openModal;
window.closeModal = closeModal;
window.closeDetailModal = closeDetailModal;
window.closeConfirmDeleteModal = closeConfirmDeleteModal;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.promptSaveEditSubject = promptSaveEditSubject;
window.closeConfirmSaveModal = closeConfirmSaveModal;
window.switchMainModule = switchMainModule;
window.openDetail = openDetail;
window.promptDeleteSubject = promptDeleteSubject;
window.executeDeleteSubject = executeDeleteSubject;
window.executeEditSave = executeEditSave;
window.exportToExcel = exportToExcel;
window.toggleWeek = toggleWeek;
window.pickModalModule = pickModalModule;
window.checkInput = checkInput;
window.saveSubject = saveSubject;