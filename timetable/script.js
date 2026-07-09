// --- script.js ---
import { saveSubjectColor, getSubjects, deleteSubjectColor, saveStructureToDB, getStructureFromDB } from './firebase-db.js';
import { generatePdfTimetable } from './pdf_generate.js'; // JAVÍTÁS: Importáltuk a PDF generálót

const CLIENT_ID = '182966635302-e0p20hcja1ob75p5g2emuekn8cqrjt9i.apps.googleusercontent.com';
const CALENDAR_ID = 'fcc56ae6437498853ec0a2289886d3376e5ce7e1a79542528d288172c4d1804b@group.calendar.google.com';
const SCOPES = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.profile';

let tokenClient;
let accessToken = null;
let weekOffset = 0; 
let globalSubjectsCache = {}; 
let globalStructureCache = { modules: [], sessions: [], vacations: [] };
let uniqueSubjectsForAutocomplete = [];
let currentEditEvent = null; 
let pendingScopeAction = null; 
let subjectToDeleteFromDB = null; 
let currentWeekEvents = []; // PDF kigenerálásához eltároljuk a heti eseményeket

window.addEventListener('load', () => {
    initInitializeGoogleAuth();
    
    setupColorSync('addSubjectColor', 'addSubjectColorHex');
    setupColorSync('editSubjectColor', 'editSubjectColorHex');
    setupColorSync('subjectColor', 'subjectColorHex');

    flatpickr(".custom-date", {
        locale: "hu",
        dateFormat: "Y-m-d",
        allowInput: true,
        disableMobile: "true" 
    });

    document.getElementById('loginBtn').addEventListener('click', handleAuthClick);
    document.getElementById('logoutBtn').addEventListener('click', handleLogoutClick);
    document.getElementById('submitBtn').addEventListener('click', uploadToGoogleCalendar);
    
    const dayOfWeekSelect = document.getElementById('dayOfWeek');

    dayOfWeekSelect.addEventListener('change', (e) => {
        const nextDate = getNextDateForDayOfWeek(parseInt(e.target.value, 10));
        const fp = document.getElementById('startDate')._flatpickr;
        if(fp) {
            fp.setDate(nextDate);
        }
    });
    
    document.getElementById('openModalBtn').addEventListener('click', () => {
        document.getElementById('eventForm').reset();
        updateColorGroup('addSubjectColor', 'addSubjectColorHex', '#3b82f6');
        document.getElementById('recurrenceCountGroup').style.display = 'none'; 
        
        const daySelect = document.getElementById('dayOfWeek');
        daySelect.value = "1";
        daySelect.dispatchEvent(new Event('change'));

        openModal('formModal');
    });
    
    document.getElementById('closeModalBtn').addEventListener('click', () => closeModal('formModal'));
    document.getElementById('openStructureModalBtn').addEventListener('click', loadAndOpenStructureModal);
    document.getElementById('closeStructureModalBtn').addEventListener('click', () => closeModal('structureModal'));
    document.getElementById('saveStructureBtn').addEventListener('click', saveStructure);
    
    // JAVÍTÁS: Átadjuk az eseményeket, a színeket és a toast függvényt is!
    document.getElementById('downloadPdfBtn').addEventListener('click', () => {
        generatePdfTimetable(currentWeekEvents, globalSubjectsCache, showToast);
    });

    document.getElementById('openColorModalBtn').addEventListener('click', () => {
        updateColorGroup('subjectColor', 'subjectColorHex', '#3b82f6');
        openModal('colorModal');
    });
    document.getElementById('closeColorModalBtn').addEventListener('click', () => closeModal('colorModal'));
    document.getElementById('saveColorBtn').addEventListener('click', handleSaveColorToFirebase);

    document.getElementById('closeEditModalBtn').addEventListener('click', () => closeModal('editModal'));
    document.getElementById('saveEditBtn').addEventListener('click', handleSaveEdit);
    document.getElementById('deleteEventBtn').addEventListener('click', handleDeleteClick);
    document.getElementById('closeScopeModalBtn').addEventListener('click', () => closeModal('updateScopeModal'));
    
    document.getElementById('scopeSingleBtn').addEventListener('click', () => {
        if (pendingScopeAction === 'edit') executeEventPatch('single');
        else if (pendingScopeAction === 'delete') executeEventDelete('single');
    });
    document.getElementById('scopeSeriesBtn').addEventListener('click', () => {
        if (pendingScopeAction === 'edit') executeEventPatch('series');
        else if (pendingScopeAction === 'delete') executeEventDelete('series');
    });

    document.getElementById('closeConfirmDeleteBtn').addEventListener('click', () => closeModal('confirmDeleteModal'));
    document.getElementById('cancelDeleteBtn').addEventListener('click', () => closeModal('confirmDeleteModal'));
    
    document.getElementById('confirmDbDeleteBtn').onclick = async () => {
        if (subjectToDeleteFromDB) {
            const targetName = subjectToDeleteFromDB.name;
            const targetType = subjectToDeleteFromDB.type;
            closeModal('confirmDeleteModal');
            
            try {
                const isSuccess = await deleteSubjectColor(targetName, targetType);
                if (isSuccess) {
                    showToast(`"${targetName}" törölve!`, "success");
                    const cacheKey = `${targetName.trim()}_${targetType.trim()}`.toLowerCase();
                    delete globalSubjectsCache[cacheKey];
                    renderSavedSubjectsListFromCache();
                } else {
                    showToast("Hiba a törlés során.", "error");
                }
            } catch (err) {
                showToast("Hálózati hiba a törlésnél.", "error");
            }
            subjectToDeleteFromDB = null;
        }
    };

    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', function(e) { if(e.target === this) closeModal(this.id); });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const activeModals = document.querySelectorAll('.modal-overlay.active');
            if (activeModals.length > 0) activeModals[activeModals.length - 1].classList.remove('active');
        }
    });

    document.getElementById('prevWeekBtn').addEventListener('click', () => { weekOffset--; fetchWeeklyTimetable(); });
    document.getElementById('nextWeekBtn').addEventListener('click', () => { weekOffset++; fetchWeeklyTimetable(); });
    document.getElementById('currWeekBtn').addEventListener('click', () => { weekOffset = 0; fetchWeeklyTimetable(); });

    document.getElementById('recurrenceType').addEventListener('change', function() {
        document.getElementById('recurrenceCountGroup').style.display = this.value === 'count' ? 'block' : 'none';
    });

    document.querySelectorAll('.time-input').forEach(input => {
        input.addEventListener('blur', handleTimeBlur);
    });

    const subjectInput = document.getElementById('subject');
    subjectInput.addEventListener('input', (e) => {
        renderCustomDropdown(e.target.value);
        updateFormColorFromCache(); 
    });
    
    subjectInput.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); renderCustomDropdown(''); }
    });
    
    subjectInput.addEventListener('focus', () => {
        if (subjectInput.value.length > 0) renderCustomDropdown(subjectInput.value);
    });

    subjectInput.addEventListener('blur', () => {
        setTimeout(() => {
            const dropdown = document.getElementById('subjectDropdown');
            if(dropdown) dropdown.classList.remove('show');
        }, 150);
    });

    document.querySelectorAll('input[name="type"]').forEach(radio => {
        radio.addEventListener('change', updateFormColorFromCache);
    });

    checkLoginState();
});

function setupColorSync(colorId, hexId) {
    const colorInput = document.getElementById(colorId);
    const hexInput = document.getElementById(hexId);
    
    colorInput.addEventListener('input', (e) => {
        hexInput.value = e.target.value.toUpperCase();
    });
    
    hexInput.addEventListener('input', (e) => {
        let val = e.target.value;
        if (!val.startsWith('#') && val.length > 0) val = '#' + val;
        if (/^#[0-9A-F]{6}$/i.test(val)) colorInput.value = val;
    });
    
    hexInput.addEventListener('blur', (e) => {
        let val = e.target.value;
        if (!val.startsWith('#')) val = '#' + val;
        if (/^#[0-9A-F]{6}$/i.test(val)) {
            colorInput.value = val;
            e.target.value = val.toUpperCase();
        } else {
            e.target.value = colorInput.value.toUpperCase();
        }
    });
}

function updateColorGroup(colorId, hexId, value) {
    const colorInput = document.getElementById(colorId);
    const hexInput = document.getElementById(hexId);
    if(colorInput && hexInput) {
        colorInput.value = value;
        hexInput.value = value.toUpperCase();
    }
}

function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

function handleTimeBlur(e) {
    let v = e.target.value.trim();
    if (!v) return;
    v = v.replace(/[^\d:]/g, '');
    if (!v.includes(':')) {
        if (v.length <= 2) v = v.padStart(2, '0') + ':00';
        else if (v.length === 3) v = '0' + v[0] + ':' + v.substring(1);
        else if (v.length >= 4) v = v.substring(0, 2) + ':' + v.substring(2, 4);
    } else {
        let parts = v.split(':');
        v = parts[0].padStart(2, '0') + ':' + (parts[1] || '00').padEnd(2, '0').substring(0, 2);
    }
    e.target.value = v;
    if (e.target.id === 'startTime') autoFillEndTime('startTime', 'endTime');
    if (e.target.id === 'editStartTime') autoFillEndTime('editStartTime', 'editEndTime');
}

function autoFillEndTime(startId, endId) {
    const startInput = document.getElementById(startId);
    const endInput = document.getElementById(endId);
    if (startInput.value && startInput.value.length === 5) {
        let parts = startInput.value.split(':');
        let h = (parseInt(parts[0], 10) + 2) % 24; 
        endInput.value = String(h).padStart(2, '0') + ':' + parts[1];
    }
}

function renderCustomDropdown(filterText) {
    const dropdown = document.getElementById('subjectDropdown');
    if (!dropdown) return;
    dropdown.innerHTML = '';
    
    let matches = uniqueSubjectsForAutocomplete;
    if (filterText) matches = matches.filter(s => s.name.toLowerCase().includes(filterText.toLowerCase()));
    
    if (matches.length === 0) { dropdown.classList.remove('show'); return; }

    matches.forEach(match => {
        const div = document.createElement('div');
        div.className = 'dropdown-item';
        div.innerHTML = `<span class="color-dot" style="background-color: ${match.color}"></span>${match.name}`;
        
        div.addEventListener('mousedown', (e) => { 
            e.preventDefault();
            document.getElementById('subject').value = match.name;
            updateColorGroup('addSubjectColor', 'addSubjectColorHex', match.color);
            dropdown.classList.remove('show');
        });
        dropdown.appendChild(div);
    });
    dropdown.classList.add('show');
}

const updateFormColorFromCache = () => {
    const val = document.getElementById('subject').value.trim().toLowerCase();
    const typeElement = document.querySelector('input[name="type"]:checked');
    const typeVal = typeElement ? typeElement.value : 'Előadás';
    const cacheKey = `${val}_${typeVal}`.toLowerCase();
    
    if (globalSubjectsCache[cacheKey]) {
        updateColorGroup('addSubjectColor', 'addSubjectColorHex', globalSubjectsCache[cacheKey].color);
    }
};

function openScopeModal(actionType) {
    pendingScopeAction = actionType;
    const title = document.getElementById('scopeModalTitle');
    const desc = document.getElementById('scopeModalDesc');
    
    if (actionType === 'edit') {
        title.innerText = 'Mentés hatóköre'; desc.innerText = 'Ez az esemény egy ismétlődő sorozat része. Mit szeretnél módosítani a Google naptárban?';
    } else {
        title.innerText = 'Törlés hatóköre'; desc.innerText = 'Ez az esemény egy ismétlődő sorozat része. Mit szeretnél törölni a Google naptárban?';
    }
    openModal('updateScopeModal');
}

async function loadSubjectsFromDatabase() {
    globalSubjectsCache = await getSubjects();
    renderSavedSubjectsListFromCache();
}

async function loadStructureFromDatabase() {
    const data = await getStructureFromDB();
    if (data) {
        globalStructureCache = data;
    }
}

function renderSavedSubjectsListFromCache() {
    const uniqueNamesMap = new Map();
    for (const key in globalSubjectsCache) {
        const sub = globalSubjectsCache[key];
        if (!uniqueNamesMap.has(sub.name)) uniqueNamesMap.set(sub.name, sub);
    }
    uniqueSubjectsForAutocomplete = Array.from(uniqueNamesMap.values());

    const listContainer = document.getElementById('savedSubjectsList');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    const allSubjects = Object.values(globalSubjectsCache);
    
    if (allSubjects.length === 0) {
        listContainer.innerHTML = '<p style="color: var(--text-secondary); font-size: 14px; text-align: center;">Még nincsenek elmentett tárgyaid.</p>';
    } else {
        allSubjects.forEach(sub => {
            const item = document.createElement('div');
            item.className = 'saved-subject-item';
            
            item.innerHTML = `
                <div class="saved-subject-info">
                    <span class="color-dot" style="background-color: ${sub.color}"></span>
                    <span><strong>${sub.name}</strong> <span style="color: var(--text-secondary); font-size: 12px; margin-left: 5px;">(${sub.type})</span></span>
                </div>
                <button type="button" class="delete-subject-btn" title="Törlés">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                </button>
            `;
            
            const delBtn = item.querySelector('.delete-subject-btn');
            delBtn.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                subjectToDeleteFromDB = { name: sub.name, type: sub.type };
                document.getElementById('confirmDeleteText').innerText = `${sub.name} (${sub.type})`;
                openModal('confirmDeleteModal');
            };
            
            listContainer.appendChild(item);
        });
    }
}

async function handleSaveColorToFirebase() {
    const name = document.getElementById('newSubjectName').value.trim();
    const color = document.getElementById('subjectColor').value;
    const typeElement = document.querySelector('input[name="colorType"]:checked');
    const typeVal = typeElement ? typeElement.value : 'Előadás';
    
    if (!name) { showToast("Kérlek, add meg a tárgy nevét!", "warning"); return; }
    
    const isSuccess = await saveSubjectColor(name, color, typeVal);
    
    if (isSuccess) {
        showToast("Tantárgy sikeresen mentve!", "success");
        document.getElementById('newSubjectName').value = ''; 
        await loadSubjectsFromDatabase(); 
        fetchWeeklyTimetable(); 
    } else {
        showToast("Hiba a mentés során.", "error");
    }
}

function loadAndOpenStructureModal() {
    const { modules, sessions, vacations } = globalStructureCache;
    
    if (modules && sessions) {
        modules.forEach(m => {
            const startInput = document.getElementById(`mod${m.id}_start`);
            const endInput = document.getElementById(`mod${m.id}_end`);
            if (startInput && m.start && startInput._flatpickr) startInput._flatpickr.setDate(m.start);
            if (endInput && m.end && endInput._flatpickr) endInput._flatpickr.setDate(m.end);
        });
        sessions.forEach(s => {
            const startInput = document.getElementById(`sess${s.id}_start`);
            const endInput = document.getElementById(`sess${s.id}_end`);
            if (startInput && s.start && startInput._flatpickr) startInput._flatpickr.setDate(s.start);
            if (endInput && s.end && endInput._flatpickr) endInput._flatpickr.setDate(s.end);
        });
    }
    
    if (vacations) {
        vacations.forEach(v => {
            const startInput = document.getElementById(`vac${v.id}_start`);
            const endInput = document.getElementById(`vac${v.id}_end`);
            if (startInput && v.start && startInput._flatpickr) startInput._flatpickr.setDate(v.start);
            if (endInput && v.end && endInput._flatpickr) endInput._flatpickr.setDate(v.end);
        });
    }
    openModal('structureModal');
}

async function saveStructure() {
    const structure = { modules: [], sessions: [], vacations: [] };
    for(let i=1; i<=4; i++) {
        const mStart = document.getElementById(`mod${i}_start`).value;
        const mEnd = document.getElementById(`mod${i}_end`).value;
        if (mStart || mEnd) structure.modules.push({ id: i, start: mStart, end: mEnd });
        
        const sStart = document.getElementById(`sess${i}_start`).value;
        const sEnd = document.getElementById(`sess${i}_end`).value;
        if (sStart || sEnd) structure.sessions.push({ id: i, start: sStart, end: sEnd });
        
        const vStart = document.getElementById(`vac${i}_start`)?.value;
        const vEnd = document.getElementById(`vac${i}_end`)?.value;
        if (vStart || vEnd) structure.vacations.push({ id: i, start: vStart, end: vEnd });
    }
    
    const isSuccess = await saveStructureToDB(structure);
    
    if (isSuccess) {
        globalStructureCache = structure;
        showToast("Év struktúra sikeresen elmentve az adatbázisba!", "success");
        closeModal('structureModal');
        fetchWeeklyTimetable(); 
    } else {
        showToast("Hiba az év struktúra mentésekor.", "error");
    }
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    
    let iconSVG = ''; let iconColor = ''; let title = '';

    if (type === 'success') {
        title = 'Sikeres művelet'; iconColor = 'var(--success)';
        iconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    } else if (type === 'warning') {
        title = 'Figyelem'; iconColor = 'var(--warning)';
        iconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
    } else {
        title = 'Hiba történt'; iconColor = 'var(--danger)';
        iconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    }

    toast.innerHTML = `<div class="toast-icon" style="color: ${iconColor}; background-color: ${iconColor}20;">${iconSVG}</div>
        <div class="toast-content"><div class="toast-title">${title}</div><div class="toast-message">${message}</div></div>`;
    toast.className = 'toast show'; 
    if (window.toastTimeout) clearTimeout(window.toastTimeout);
    window.toastTimeout = setTimeout(() => { toast.classList.remove('show'); }, 4000);
}

function checkLoginState() {
    const storedToken = localStorage.getItem('gcal_token');
    const tokenExpiry = localStorage.getItem('gcal_token_expiry');
    const storedPic = localStorage.getItem('gcal_profile_pic');
    if (storedToken && tokenExpiry && Date.now() < parseInt(tokenExpiry, 10)) {
        accessToken = storedToken; updateUIForLoggedIn(storedPic);
    } else { resetLogoutState(); }
}

function updateUIForLoggedIn(picUrl) {
    document.getElementById('loginBtn').style.display = 'none';
    document.getElementById('logoutBtn').style.display = 'inline-flex';
    document.getElementById('openModalBtn').style.display = 'inline-block';
    document.getElementById('openStructureModalBtn').style.display = 'inline-block';
    document.getElementById('downloadPdfBtn').style.display = 'inline-block'; 
    
    if (picUrl) document.getElementById('profileIcon').src = picUrl;
    document.getElementById('scheduleMessage').style.display = 'none';
    document.getElementById('weekHeaderLabel').style.display = 'block';
    document.getElementById('timetableGrid').style.display = 'flex';
    document.getElementById('weekNavContainer').style.display = 'flex';
    
    weekOffset = 0; 
    
    Promise.all([
        loadSubjectsFromDatabase(),
        loadStructureFromDatabase()
    ]).then(() => fetchWeeklyTimetable());
}

function initInitializeGoogleAuth() {
    if (typeof google === 'undefined') return;
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID, scope: SCOPES,
        callback: (tokenResponse) => {
            if (tokenResponse.error !== undefined) { showToast("Hiba bejelentkezéskor.", "error"); return; }
            accessToken = tokenResponse.access_token;
            localStorage.setItem('gcal_token', accessToken);
            localStorage.setItem('gcal_token_expiry', Date.now() + (3500 * 1000));
            showToast("Sikeresen bejelentkeztél Google fiókodba!", "success");
            fetchUserProfile(accessToken);
            updateUIForLoggedIn(null); 
        },
    });
}

function fetchUserProfile(token) {
    fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', { headers: { 'Authorization': 'Bearer ' + token } })
    .then(res => res.json()).then(data => {
        if (data.picture) { localStorage.setItem('gcal_profile_pic', data.picture); document.getElementById('profileIcon').src = data.picture; }
    }).catch(err => console.error(err));
}

function handleAuthClick() { if (tokenClient) tokenClient.requestAccessToken({ prompt: 'consent' }); }

function handleLogoutClick() {
    if (accessToken && typeof google !== 'undefined') {
        try {
            google.accounts.oauth2.revokeToken(accessToken, () => {
                console.log("Token visszavonva.");
            });
        } catch (e) {
            console.error("Hiba a token visszavonásakor:", e);
        }
    }
    
    resetLogoutState();
    showToast("Sikeresen kijelentkeztél.", "success");
}

function resetLogoutState() {
    accessToken = null; localStorage.removeItem('gcal_token'); localStorage.removeItem('gcal_token_expiry'); localStorage.removeItem('gcal_profile_pic');
    document.getElementById('loginBtn').style.display = 'inline-flex'; document.getElementById('logoutBtn').style.display = 'none';
    document.getElementById('openModalBtn').style.display = 'none'; document.getElementById('openStructureModalBtn').style.display = 'none';
    document.getElementById('downloadPdfBtn').style.display = 'none';
    document.getElementById('scheduleMessage').style.display = 'block'; document.getElementById('weekHeaderLabel').style.display = 'none';
    document.getElementById('timetableGrid').style.display = 'none'; document.getElementById('weekNavContainer').style.display = 'none';
}

function getNextDateForDayOfWeek(dayOfWeekNum) {
    const today = new Date();
    let distance = dayOfWeekNum - today.getDay();
    if (distance < 0) distance += 7;
    return new Date(today.setDate(today.getDate() + distance));
}

async function uploadToGoogleCalendar() {
    if (!accessToken) return;
    const subjectName = document.getElementById('subject').value.trim();
    const color = document.getElementById('addSubjectColor').value;
    const location = document.getElementById('location').value.trim();
    const dayOfWeek = parseInt(document.getElementById('dayOfWeek').value, 10);
    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;
    
    const recType = document.getElementById('recurrenceType').value;
    let recurrenceCount = parseInt(document.getElementById('recurrenceCount').value, 10) || 1;
    const typeElement = document.querySelector('input[name="type"]:checked');
    const typeVal = typeElement ? typeElement.value : 'Előadás';
    
    if (!subjectName || !startTime || !endTime) { showToast("A tárgy neve, a kezdés és a vége kötelező!", "warning"); return; }

    await saveSubjectColor(subjectName, color, typeVal);
    await loadSubjectsFromDatabase(); 

    const startDateVal = document.getElementById('startDate').value;
    if (!startDateVal) { showToast("Kérlek válaszd ki az első alkalom dátumát!", "warning"); return; }
    const targetDate = new Date(startDateVal);

    const selectedDayCode = dayOfWeek === 7 ? 0 : dayOfWeek; 
    if (targetDate.getDay() !== selectedDayCode) {
        showToast("Figyelem: A kiválasztott dátum napja nem egyezik a lenyíló listában megadott nappal!", "warning");
    }
    
    if (recType === 'module') {
        const { modules, sessions } = globalStructureCache;
        if (modules && modules.length > 0) {
            let foundEnd = null;
            
            for (let m of modules) {
                if (m.start && m.end) {
                    let mStart = new Date(m.start); mStart.setHours(0,0,0,0);
                    let mEnd = new Date(m.end); mEnd.setHours(23,59,59,999);
                    if (targetDate >= mStart && targetDate <= mEnd) { foundEnd = mEnd; break; }
                }
            }
            if (!foundEnd) {
                for (let s of sessions) {
                    if (s.start && s.end) {
                        let sStart = new Date(s.start); sStart.setHours(0,0,0,0);
                        let sEnd = new Date(s.end); sEnd.setHours(23,59,59,999);
                        if (targetDate >= sStart && targetDate <= sEnd) { foundEnd = sEnd; break; }
                    }
                }
            }
            
            if (foundEnd) {
                let diffDays = Math.round((foundEnd.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));
                recurrenceCount = Math.floor(diffDays / 7) + 1;
            } else {
                showToast("A dátum nem esik egy modulba sem. Csak 1 alkalom lett mentve.", "warning");
                recurrenceCount = 1;
            }
        } else {
            showToast("Nincs év struktúra beállítva. Csak 1 alkalom lett mentve.", "warning");
            recurrenceCount = 1;
        }
    }

    const startIso = `${targetDate.getFullYear()}-${String(targetDate.getMonth()+1).padStart(2,'0')}-${String(targetDate.getDate()).padStart(2,'0')}T${startTime}:00`;
    const endIso = `${targetDate.getFullYear()}-${String(targetDate.getMonth()+1).padStart(2,'0')}-${String(targetDate.getDate()).padStart(2,'0')}T${endTime}:00`;
    const dayCodes = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    const userTZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Budapest';

    const eventResource = {
        'summary': `${subjectName} (${typeVal})`, 'location': location,
        'start': { 'dateTime': startIso, 'timeZone': userTZ }, 'end': { 'dateTime': endIso, 'timeZone': userTZ },
        'recurrence': [`RRULE:FREQ=WEEKLY;BYDAY=${dayCodes[dayOfWeek]};COUNT=${recurrenceCount}`]
    };

    fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events`, {
        method: 'POST', headers: { 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify(eventResource)
    }).then(res => res.json()).then(() => {
        showToast(`"${subjectName}" sikeresen rögzítve a naptárban!`, "success");
        closeModal('formModal'); document.getElementById('eventForm').reset();
        document.getElementById('recurrenceCountGroup').style.display = 'none'; 
        weekOffset = 0; fetchWeeklyTimetable();
    }).catch(err => showToast(err.message, "error"));
}

function isDateInRanges(date, ranges) {
    if (!ranges) return false;
    for (let r of ranges) {
        if (r.start && r.end) {
            let rStart = new Date(r.start); rStart.setHours(0,0,0,0);
            let rEnd = new Date(r.end); rEnd.setHours(23,59,59,999);
            if (date >= rStart && date <= rEnd) return true;
        }
    }
    return false;
}

function updateWeekLabel(monday, sunday) {
    const label = document.getElementById('currentWeekLabel');
    const formatOpts = { month: 'short', day: 'numeric' };
    const dateStr = `${monday.toLocaleDateString('hu-HU', formatOpts)} - ${sunday.toLocaleDateString('hu-HU', formatOpts)}`;
    let labelText = dateStr;
    
    const { modules, sessions, vacations } = globalStructureCache;
    
    const midWeek = new Date(monday);
    midWeek.setDate(midWeek.getDate() + 3);

    if (isDateInRanges(midWeek, vacations)) {
        label.innerText = `Vakáció / szünet (${dateStr})`;
        return;
    }

    if (modules || sessions) {
        let found = false;
        
        if (modules) {
            for (let m of modules) {
                if (m.start && m.end) {
                    let mStart = new Date(m.start); mStart.setHours(0, 0, 0, 0);
                    let mEnd = new Date(m.end); mEnd.setHours(23, 59, 59, 999);
                    
                    if (monday >= mStart && monday <= mEnd) {
                        let mStartMonday = new Date(mStart);
                        let dayOfWeek = mStartMonday.getDay();
                        let diff = mStartMonday.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
                        mStartMonday.setDate(diff);

                        let weekNum = 0;
                        let iterMonday = new Date(mStartMonday);
                        
                        while (iterMonday <= monday) {
                            let iterMid = new Date(iterMonday);
                            iterMid.setDate(iterMid.getDate() + 3); 
                            
                            if (!isDateInRanges(iterMid, vacations)) {
                                weekNum++;
                            }
                            iterMonday.setDate(iterMonday.getDate() + 7);
                        }
                        
                        if (weekNum === 0) weekNum = 1;
                        labelText = `${m.id}. modul - ${weekNum}. hét (${dateStr})`; found = true; break;
                    }
                }
            }
        }
        
        if (!found && sessions) {
            for (let s of sessions) {
                if (s.start && s.end) {
                    let sStart = new Date(s.start); sStart.setHours(0, 0, 0, 0);
                    let sEnd = new Date(s.end); sEnd.setHours(23, 59, 59, 999);
                    
                    if (monday >= sStart && monday <= sEnd) {
                        let sStartMonday = new Date(sStart);
                        let dayOfWeek = sStartMonday.getDay();
                        let diff = sStartMonday.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
                        sStartMonday.setDate(diff);

                        let weekNum = 0;
                        let iterMonday = new Date(sStartMonday);
                        
                        while (iterMonday <= monday) {
                            let iterMid = new Date(iterMonday);
                            iterMid.setDate(iterMid.getDate() + 3);
                            
                            if (!isDateInRanges(iterMid, vacations)) {
                                weekNum++;
                            }
                            iterMonday.setDate(iterMonday.getDate() + 7);
                        }
                        
                        if (weekNum === 0) weekNum = 1;
                        labelText = `${s.id}. szesszió - ${weekNum}. hét (${dateStr})`; found = true; break;
                    }
                }
            }
        }
        
        if (!found && ((modules && modules.length > 0) || (sessions && sessions.length > 0))) {
            labelText = `Vakáció / szünet (${dateStr})`;
        }
    }
    label.innerText = labelText;
}

function fetchWeeklyTimetable() {
    if (!accessToken) return;
    const curr = new Date(); curr.setDate(curr.getDate() + (weekOffset * 7));
    const first = curr.getDate() - curr.getDay() + (curr.getDay() === 0 ? -6 : 1); 
    const monday = new Date(curr.setDate(first)); monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23, 59, 59, 999);

    updateWeekLabel(monday, sunday);

    fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events?timeMin=${monday.toISOString()}&timeMax=${sunday.toISOString()}&singleEvents=true&orderBy=startTime`, {
        headers: { 'Authorization': 'Bearer ' + accessToken }
    })
    .then(res => {
        if (res.status === 401) { resetLogoutState(); throw new Error("Lejárt a munkamenet!"); }
        return res.json();
    }).then(data => {
        currentWeekEvents = data.items || [];
        renderTimetable(currentWeekEvents);
    }).catch(err => console.error(err));
}

function renderTimetable(events) {
    for(let i=1; i<=5; i++) {
        const c = document.querySelector(`#day-${i} .events-container`); if(c) c.innerHTML = '';
    }

    events.forEach(event => {
        if (!event.start || !event.start.dateTime) return; 
        const sDate = new Date(event.start.dateTime); const eDate = new Date(event.end.dateTime);
        const day = sDate.getDay(); 
        
        if (day >= 1 && day <= 5) {
            const container = document.querySelector(`#day-${day} .events-container`);
            const sStr = sDate.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
            const eStr = eDate.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
            
            let fullSummary = event.summary || ''; let subjectName = fullSummary; let type = 'Előadás';
            if (fullSummary.includes('(')) {
                const parts = fullSummary.split('('); subjectName = parts[0].trim(); type = parts[1].replace(')', '').trim();
            }

            let eventColor = '#3b82f6'; 
            const cacheKey = `${subjectName}_${type}`.toLowerCase();
            if (globalSubjectsCache[cacheKey]) eventColor = globalSubjectsCache[cacheKey].color;
            
            const card = document.createElement('div'); card.className = 'event-card';
            card.style.backgroundColor = eventColor + '40'; card.style.borderColor = eventColor + '80';
            
            card.innerHTML = `<div class="event-time">${sStr} - ${eStr}</div>
                              <div class="event-title">${fullSummary || 'Névtelen esemény'}</div>
                              <div class="event-location">📍 ${event.location || '-'}</div>`;
            
            card.addEventListener('mouseenter', () => { card.style.backgroundColor = eventColor + '60'; });
            card.addEventListener('mouseleave', () => { card.style.backgroundColor = eventColor + '40'; });
            card.addEventListener('click', () => openEditModal(event, eventColor));
            
            container.appendChild(card);
        }
    });
}

function openEditModal(event, color) {
    currentEditEvent = event;
    let fullSummary = event.summary || ''; let subjectName = fullSummary; let type = 'Előadás';
    if (fullSummary.includes('(')) {
        const parts = fullSummary.split('('); subjectName = parts[0].trim(); type = parts[1].replace(')', '').trim();
    }
    
    document.getElementById('editSubject').value = subjectName;
    if (type === 'Gyakorlat') document.getElementById('editTypePractice').checked = true;
    else document.getElementById('editTypeLecture').checked = true;
    
    const hexColor = color.startsWith('#') ? color : '#3b82f6';
    updateColorGroup('editSubjectColor', 'editSubjectColorHex', hexColor);
    document.getElementById('editLocation').value = event.location || '';

    if (event.start && event.start.dateTime) {
        const startD = new Date(event.start.dateTime); const endD = new Date(event.end.dateTime);
        const year = startD.getFullYear(); const month = String(startD.getMonth() + 1).padStart(2, '0'); const day = String(startD.getDate()).padStart(2, '0');
        
        const fpEdit = document.getElementById('editDate')._flatpickr;
        if(fpEdit) fpEdit.setDate(`${year}-${month}-${day}`);
        
        document.getElementById('editStartTime').value = startD.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
        document.getElementById('editEndTime').value = endD.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
    }
    openModal('editModal');
}

async function handleSaveEdit() {
    const newSub = document.getElementById('editSubject').value.trim();
    const typeElement = document.querySelector('input[name="editType"]:checked');
    const typeVal = typeElement ? typeElement.value : 'Előadás';
    const newColor = document.getElementById('editSubjectColor').value;
    
    await saveSubjectColor(newSub, newColor, typeVal);
    await loadSubjectsFromDatabase(); 

    if (currentEditEvent.recurringEventId) openScopeModal('edit');
    else executeEventPatch('single');
}

function handleDeleteClick() {
    if (currentEditEvent && currentEditEvent.recurringEventId) openScopeModal('delete');
    else executeEventDelete('single');
}

async function executeEventPatch(scope) {
    if (!currentEditEvent || !accessToken) return;

    const subjectName = document.getElementById('editSubject').value.trim();
    const typeElement = document.querySelector('input[name="editType"]:checked');
    const typeVal = typeElement ? typeElement.value : 'Előadás';
    const summary = `${subjectName} (${typeVal})`;
    
    const location = document.getElementById('editLocation').value.trim();
    const dateStr = document.getElementById('editDate').value;
    const startStr = document.getElementById('editStartTime').value;
    const endStr = document.getElementById('editEndTime').value;
    const userTZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Budapest';

    const patchData = {
        summary: summary, location: location,
        start: { dateTime: `${dateStr}T${startStr}:00`, timeZone: userTZ }, end: { dateTime: `${dateStr}T${endStr}:00`, timeZone: userTZ }
    };

    let targetId = currentEditEvent.id;
    if (scope === 'series') targetId = currentEditEvent.recurringEventId;

    try {
        const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${targetId}`, {
            method: 'PATCH', headers: { 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
            body: JSON.stringify(patchData)
        });

        if (!res.ok) throw new Error("Hiba történt a mentés során.");

        showToast("Esemény sikeresen frissítve!", "success");
        closeModal('editModal'); closeModal('updateScopeModal'); fetchWeeklyTimetable();
    } catch (err) { showToast(err.message, "error"); }
}

async function executeEventDelete(scope) {
    if (!currentEditEvent || !accessToken) return;

    let targetId = currentEditEvent.id;
    if (scope === 'series') targetId = currentEditEvent.recurringEventId;

    try {
        const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${targetId}`, {
            method: 'DELETE', headers: { 'Authorization': 'Bearer ' + accessToken }
        });

        if (!res.ok) throw new Error("Hiba történt a törlés során.");

        showToast("Esemény sikeresen törölve a naptárból!", "success");
        closeModal('editModal'); closeModal('updateScopeModal'); fetchWeeklyTimetable();
    } catch (err) { showToast(err.message, "error"); }
}