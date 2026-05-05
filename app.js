// 1. Import Firebase Core and Auth modules from the web
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, setDoc, getDoc, query, where, updateDoc, arrayUnion, arrayRemove, deleteDoc } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

// 2. YOUR FIREBASE CONFIGURATION
const firebaseConfig = {
    apiKey: "AIzaSyBE3QMPEfldEQ8lb0xgzLpE9k6hYdG7AzE",
    authDomain: "oem-content-tracker.firebaseapp.com",
    projectId: "oem-content-tracker",
    storageBucket: "oem-content-tracker.firebasestorage.app",
    messagingSenderId: "454662986170",
    appId: "1:454662986170:web:f45ff27c8d6b42da75e583"
};

// 3. Initialize Firebase, Auth, and Firestore
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();


// =============================================================
//  APP STATE
// =============================================================
const appData = {
    oems: {},
    clients: {},
    tracking: {},
    locations: {},           // NEW: location page tracking data
    activeOemId: null,
    currentUserUid: null,
    userPreferences: { selectedClients: [] },
    activeClientGroup: 'all',
    activeLocationClientGroup: 'all', // NEW: separate group filter for location page
    activeLocationClientId: null,      // NEW: which client tab is active on location page
    activePageType: 'models'           // NEW: 'models' | 'locations'
};


// =============================================================
//  LOGIN / LOGOUT
// =============================================================
const loginBtn = document.getElementById('login-btn');

loginBtn.addEventListener('click', () => {
    if (appData.currentUserUid) {
        signOut(auth).then(() => {
            console.log("Successfully logged out.");
        }).catch((error) => {
            console.error("Error signing out:", error);
            alert("Failed to sign out. Please try again.");
        });
    } else {
        signInWithPopup(auth, provider).catch((error) => {
            console.error("Error signing in:", error);
        });
    }
});


// =============================================================
//  AUTHENTICATION LISTENER
// =============================================================
onAuthStateChanged(auth, async (user) => {
    const dashboardTitle = document.getElementById('dashboard-title');
    const loader = document.getElementById('loading-overlay');
    const settingsBtn = document.getElementById('settings-btn');

    if (user) {
        document.body.classList.remove('logged-out');
        appData.currentUserUid = user.uid;
        document.getElementById('login-btn').textContent = 'Log Out';

        if (settingsBtn) settingsBtn.classList.remove('hidden');

        const firstName = user.displayName ? user.displayName.split(' ')[0] : 'User';
        if (dashboardTitle) dashboardTitle.textContent = `Welcome, ${firstName}!`;

        await loadUserData(user.uid);
        await loadMasterData();
    } else {
        document.body.classList.add('logged-out');
        appData.currentUserUid = null;
        document.getElementById('login-btn').textContent = 'Log in with Google';

        if (dashboardTitle) dashboardTitle.textContent = 'Dashboard';
        if (settingsBtn) settingsBtn.classList.add('hidden');
        if (loader) loader.classList.add('fade-out');
    }
});


// =============================================================
//  DOM ELEMENTS — SETTINGS
// =============================================================
const clientSelect = document.getElementById('client-select');
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.querySelector('.close-settings-btn');
const clientSelectionList = document.getElementById('client-selection-list');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const clearSettingsBtn = document.getElementById('clear-settings-btn');
const clientSearch = document.getElementById('client-search');
const selectedClientsList = document.getElementById('selected-clients-list');
const selectedCount = document.getElementById('selected-count');


// =============================================================
//  SETTINGS — SELECTED CLIENTS UI
// =============================================================
const updateSelectedClientsUI = () => {
    const checkboxes = document.querySelectorAll('.client-filter-cb:checked');
    selectedCount.textContent = checkboxes.length;

    if (checkboxes.length === 0) {
        selectedClientsList.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem; font-style: italic; text-align: center; margin-top: 20px;">No clients selected.</p>';
        return;
    }

    let html = '';
    checkboxes.forEach(cb => {
        const clientName = cb.getAttribute('data-displayname');
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; border-bottom: 1px solid var(--border-color); font-size: 0.9rem;">
                <span style="color: var(--text-main);">${clientName}</span>
                <button class="remove-client-btn" data-id="${cb.value}" title="Remove" style="background: none; border: none; color: var(--status-red); cursor: pointer; font-size: 1.25rem; font-weight: bold; line-height: 1; padding: 0 5px;">&times;</button>
            </div>
        `;
    });
    selectedClientsList.innerHTML = html;
};

selectedClientsList.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-client-btn')) {
        const clientId = e.target.getAttribute('data-id');
        const cb = document.querySelector(`.client-filter-cb[value="${clientId}"]`);

        if (cb) {
            cb.checked = false;
            const wrapper = cb.closest('.client-group-wrapper');
            const selectAllCb = wrapper.querySelector('.group-select-all');
            if (selectAllCb) selectAllCb.checked = false;
        }

        updateSelectedClientsUI();
    }
});


// =============================================================
//  SETTINGS — OPEN / CLOSE / SEARCH
// =============================================================
const openSettingsModal = () => {
    clientSearch.value = '';

    const groupedClients = {};
    Object.entries(appData.clients).forEach(([id, client]) => {
        const groupName = client.group || "Ungrouped";
        if (!groupedClients[groupName]) groupedClients[groupName] = [];
        groupedClients[groupName].push({ id, ...client });
    });

    let html = '';
    const sortedGroups = Object.keys(groupedClients).sort();

    for (const groupName of sortedGroups) {
        const clients = groupedClients[groupName];

        html += `<div class="client-group-wrapper" data-group="${groupName}">`;
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #ccc; margin-top: 10px; padding-bottom: 4px;">
                <h4 style="margin: 0;">${groupName}</h4>
                <label style="font-size: 0.8rem; cursor: pointer; color: var(--primary-color); font-weight: 600;">
                    <input type="checkbox" class="group-select-all"> Select All
                </label>
            </div>
            <div class="group-clients-container">
        `;

        clients.forEach(c => {
            const isChecked = appData.userPreferences.selectedClients.includes(c.id) ? 'checked' : '';
            html += `
                <label class="client-label" style="display: block; margin: 5px 0 5px 10px; cursor: pointer;" data-name="${c.name.toLowerCase()}">
                    <input type="checkbox" class="client-filter-cb" value="${c.id}" data-displayname="${c.name}" ${isChecked}>
                    ${c.name}
                </label>
            `;
        });

        html += `</div></div>`;
    }

    clientSelectionList.innerHTML = html;
    updateSelectedClientsUI();
    settingsModal.classList.remove('hidden');
};

const closeSettingsModal = () => settingsModal.classList.add('hidden');

settingsBtn.addEventListener('click', openSettingsModal);
closeSettingsBtn.addEventListener('click', closeSettingsModal);

clientSearch.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const groupWrappers = document.querySelectorAll('.client-group-wrapper');

    groupWrappers.forEach(wrapper => {
        const groupName = wrapper.getAttribute('data-group').toLowerCase();
        const labels = wrapper.querySelectorAll('.client-label');

        if (groupName.includes(searchTerm)) {
            wrapper.style.display = 'block';
            labels.forEach(label => { label.style.display = 'block'; });
        } else {
            let hasVisibleClients = false;
            labels.forEach(label => {
                const clientName = label.getAttribute('data-name');
                if (clientName.includes(searchTerm)) {
                    label.style.display = 'block';
                    hasVisibleClients = true;
                } else {
                    label.style.display = 'none';
                }
            });
            wrapper.style.display = hasVisibleClients ? 'block' : 'none';
        }
    });
});

clientSelectionList.addEventListener('change', (e) => {
    if (e.target.classList.contains('group-select-all')) {
        const wrapper = e.target.closest('.client-group-wrapper');
        const checkboxes = wrapper.querySelectorAll('.client-filter-cb');
        checkboxes.forEach(cb => {
            const label = cb.closest('.client-label');
            if (label.style.display !== 'none') {
                cb.checked = e.target.checked;
            }
        });
    }
    updateSelectedClientsUI();
});


// =============================================================
//  SETTINGS — SAVE / CLEAR
// =============================================================
saveSettingsBtn.addEventListener('click', async () => {
    const checkboxes = document.querySelectorAll('.client-filter-cb:checked');
    const selected = Array.from(checkboxes).map(cb => cb.value);

    appData.userPreferences.selectedClients = selected;

    if (appData.currentUserUid) {
        await setDoc(doc(db, "users", appData.currentUserUid), {
            preferences: appData.userPreferences
        }, { merge: true });
    }

    closeSettingsModal();
    await fetchTrackingData();
    await fetchLocationData();
    applyFiltersAndRedraw();
});

clearSettingsBtn.addEventListener('click', async () => {
    appData.userPreferences.selectedClients = [];

    if (appData.currentUserUid) {
        await setDoc(doc(db, "users", appData.currentUserUid), {
            preferences: appData.userPreferences
        }, { merge: true });
    }

    closeSettingsModal();
    await fetchTrackingData();
    await fetchLocationData();
    applyFiltersAndRedraw();
});


// =============================================================
//  MASTER REDRAW
// =============================================================
const applyFiltersAndRedraw = () => {
    // Models side
    renderClientGroupDropdown();
    renderTabs();

    const validTabs = Array.from(document.querySelectorAll('.tab-btn'));
    if (validTabs.length > 0 && !validTabs.some(tab => tab.classList.contains('active'))) {
        validTabs[0].click();
    } else {
        renderTable();
    }

    renderDashboard();

    // Locations side
    renderLocationClientGroupDropdown();
    renderLocationTabs();
    renderLocationDashboard();
};


// =============================================================
//  DOM ELEMENTS — MODEL WORKSPACE
// =============================================================
const oemTabsContainer = document.getElementById('oem-tabs');
const tableHead = document.querySelector('#tracking-table thead');
const tableBody = document.querySelector('#tracking-table tbody');

// Dynamic model year injection
const dynamicModelYearSpan = document.getElementById('dynamic-model-year');
if (dynamicModelYearSpan) {
    dynamicModelYearSpan.textContent = new Date().getFullYear() + 1;
}


// =============================================================
//  SHARED — MULTI-INPUT LIST HELPERS
// =============================================================

// Creates one input row and appends it to the given list container.
// placeholder — hint text for the input
// onEnter — callback fired when Enter is pressed in that input
const createInputRow = (listEl, placeholder, onEnter) => {
    const row = document.createElement('div');
    row.className = 'multi-input-row';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-remove-row';
    removeBtn.innerHTML = '&times;';
    removeBtn.title = 'Remove row';
    removeBtn.type = 'button';

    removeBtn.addEventListener('click', () => {
        row.remove();
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            onEnter(input);
        }
    });

    row.appendChild(input);
    row.appendChild(removeBtn);
    listEl.appendChild(row);
    input.focus();
    return input;
};

// Returns all non-empty trimmed values from a multi-input list
const getInputListValues = (listEl) => {
    return Array.from(listEl.querySelectorAll('input[type="text"]'))
        .map(i => i.value.trim())
        .filter(v => v.length > 0);
};


// =============================================================
//  ADD MODEL ENGINE
// =============================================================
const addModelBtn = document.getElementById('add-model-btn');
const addModelModal = document.getElementById('add-model-modal');
const closeAddModelBtn = document.querySelector('.close-add-model-btn');
const saveNewModelBtn = document.getElementById('save-new-model-btn');
const addModelOemName = document.getElementById('add-model-oem-name');
const modelInputList = document.getElementById('model-input-list');
const addModelRowBtn = document.getElementById('add-model-row-btn');

const addModelInputRow = () => {
    createInputRow(modelInputList, 'e.g. Bronco Sport', (input) => {
        // Enter on any row → add a new blank row below
        addModelInputRow();
    });
};

addModelBtn.addEventListener('click', () => {
    if (!appData.activeOemId) return;
    addModelOemName.textContent = appData.oems[appData.activeOemId].name;
    modelInputList.innerHTML = '';
    addModelInputRow(); // Start with one blank row
    addModelModal.classList.remove('hidden');
});

closeAddModelBtn.addEventListener('click', () => {
    addModelModal.classList.add('hidden');
    modelInputList.innerHTML = '';
});

addModelRowBtn.addEventListener('click', () => addModelInputRow());

saveNewModelBtn.addEventListener('click', async () => {
    const values = getInputListValues(modelInputList);
    if (values.length === 0) return alert("Please enter at least one model name.");

    const activeOem = appData.oems[appData.activeOemId];

    // Duplicate check against existing models
    const duplicates = values.filter(v =>
        activeOem.models.some(m => m.toLowerCase() === v.toLowerCase())
    );
    if (duplicates.length > 0) {
        return alert(`The following model(s) already exist for ${activeOem.name}:\n• ${duplicates.join('\n• ')}`);
    }

    // Duplicate check within the entered list itself
    const uniqueValues = [...new Set(values.map(v => v.toLowerCase()))];
    if (uniqueValues.length < values.length) {
        return alert("Your list contains duplicate entries. Please remove them before saving.");
    }

    try {
        saveNewModelBtn.textContent = "Saving...";
        saveNewModelBtn.disabled = true;

        const oemRef = doc(db, "oems", appData.activeOemId);
        await updateDoc(oemRef, { models: arrayUnion(...values) });

        values.forEach(v => activeOem.models.push(v));
        renderTable();

        addModelModal.classList.add('hidden');
        modelInputList.innerHTML = '';
        saveNewModelBtn.textContent = "Save Models";
        saveNewModelBtn.disabled = false;

        console.log(`Added ${values.length} model(s) to ${activeOem.name}`);
    } catch (error) {
        console.error("Error adding models:", error);
        alert("Failed to add models. Please try again.");
        saveNewModelBtn.textContent = "Save Models";
        saveNewModelBtn.disabled = false;
    }
});


// =============================================================
//  DARK MODE
// =============================================================
const themeToggleCb = document.getElementById('theme-toggle-cb');
const currentTheme = localStorage.getItem('app-theme') || 'light';

if (currentTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    themeToggleCb.checked = true;
} else {
    document.documentElement.setAttribute('data-theme', 'light');
    themeToggleCb.checked = false;
}

themeToggleCb.addEventListener('change', (e) => {
    if (e.target.checked) {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('app-theme', 'dark');
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('app-theme', 'light');
    }
});


// =============================================================
//  PAGE TYPE SWITCHER
// =============================================================
const pageTypeBtns = document.querySelectorAll('.page-type-btn');
const pageContents = document.querySelectorAll('.page-content');

pageTypeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const page = btn.getAttribute('data-page');
        appData.activePageType = page;

        // Toggle active button
        pageTypeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Toggle active page
        pageContents.forEach(p => p.classList.remove('active'));
        document.getElementById(`${page}-page`).classList.add('active');

        // Trigger a render for whichever page we just switched to,
        // so data is always fresh when you land on it
        if (page === 'locations') {
            renderLocationClientGroupDropdown();
            renderLocationTabs();
            renderLocationDashboard();
        } else {
            renderClientGroupDropdown();
            renderTabs();
            renderTable();
            renderDashboard();
        }
    });
});


// =============================================================
//  FETCH: MODEL TRACKING DATA (existing)
// =============================================================
const fetchTrackingData = async (oemId = null) => {
    console.log(oemId ? `Fetching model data for OEM: ${oemId}` : "Fetching all model data...");

    const selected = appData.userPreferences.selectedClients;
    if (selected.length === 0) return;

    let q;
    if (oemId) {
        q = query(
            collection(db, "tracking"),
            where("clientId", "in", selected.slice(0, 30)),
            where("oemId", "==", oemId)
        );
    } else {
        for (let i = 0; i < selected.length; i += 30) {
            const batch = selected.slice(i, i + 30);
            const dashboardQuery = query(collection(db, "tracking"), where("clientId", "in", batch));
            const snapshot = await getDocs(dashboardQuery);
            snapshot.forEach(doc => { appData.tracking[doc.id] = doc.data(); });
        }
        return;
    }

    const snapshot = await getDocs(q);
    snapshot.forEach(doc => { appData.tracking[doc.id] = doc.data(); });
};


// =============================================================
//  FETCH: LOCATION TRACKING DATA (new)
// =============================================================
const fetchLocationData = async () => {
    console.log("Fetching location tracking data...");

    const selected = appData.userPreferences.selectedClients;
    if (selected.length === 0) return;

    // Batch in groups of 30 (Firebase 'in' query limit)
    for (let i = 0; i < selected.length; i += 30) {
        const batch = selected.slice(i, i + 30);
        const q = query(collection(db, "locations"), where("clientId", "in", batch));
        const snapshot = await getDocs(q);
        snapshot.forEach(doc => { appData.locations[doc.id] = doc.data(); });
    }
};


// =============================================================
//  FETCH: USER SETTINGS
// =============================================================
const loadUserData = async (uid) => {
    try {
        console.log("Fetching user preferences...");
        const userDocRef = doc(db, "users", uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
            const data = userDocSnap.data();
            if (data.preferences && data.preferences.selectedClients) {
                appData.userPreferences.selectedClients = data.preferences.selectedClients;
            }
        } else {
            await setDoc(userDocRef, { preferences: { selectedClients: [] } });
            appData.userPreferences.selectedClients = [];
        }
    } catch (error) {
        console.error("Error loading user data:", error);
    }
};


// =============================================================
//  MASTER DATA LOADER
// =============================================================
const loadMasterData = async () => {
    const loader = document.getElementById('loading-overlay');
    try {
        console.log("Starting Master Data sync...");

        // Fetch tracking data for dashboard counts
        await fetchTrackingData();
        await fetchLocationData(); // NEW

        renderClientGroupDropdown();
        renderLocationClientGroupDropdown(); // NEW
        renderTabs();

        // Cache logic
        const metaRef = doc(db, "metadata", "last_updated");
        const metaSnap = await getDoc(metaRef);

        let remoteTime = null;
        if (metaSnap.exists()) {
            remoteTime = metaSnap.data().oem_client_sync;
        }

        const localTime = localStorage.getItem('last_sync_time');
        const cachedClients = localStorage.getItem('cached_clients');

        if (remoteTime && remoteTime === localTime && cachedClients) {
            appData.oems = JSON.parse(localStorage.getItem('cached_oems'));
            appData.clients = JSON.parse(localStorage.getItem('cached_clients'));
            console.log("Optimization Active: Using cached Master Data.");
        } else {
            console.log("Syncing from Firebase...");

            const oemSnapshot = await getDocs(collection(db, "oems"));
            appData.oems = {};
            oemSnapshot.forEach(doc => { appData.oems[doc.id] = doc.data(); });

            const clientSnapshot = await getDocs(collection(db, "clients"));
            appData.clients = {};
            clientSnapshot.forEach(doc => { appData.clients[doc.id] = doc.data(); });

            localStorage.setItem('cached_oems', JSON.stringify(appData.oems));
            localStorage.setItem('cached_clients', JSON.stringify(appData.clients));
            if (remoteTime) localStorage.setItem('last_sync_time', remoteTime);
        }

        // Final renders
        await fetchTrackingData();
        await fetchLocationData(); // NEW

        renderClientGroupDropdown();
        renderLocationClientGroupDropdown(); // NEW
        renderTabs();

        const validTabs = Array.from(document.querySelectorAll('.tab-btn'));
        if (validTabs.length > 0) {
            validTabs[0].click();
        } else {
            renderTable();
        }

        renderDashboard();
        renderLocationTabs();      // NEW
        renderLocationDashboard();  // NEW

    } catch (error) {
        console.error("Critical Error in loadMasterData:", error);
    } finally {
        if (loader) loader.classList.add('fade-out');
    }
};


// =============================================================
//  MODEL TABS
// =============================================================
const renderTabs = () => {
    const oemTabsContainer = document.getElementById('oem-tabs-container');
    if (!oemTabsContainer) return;

    oemTabsContainer.innerHTML = '';

    let allowedOems = new Set();
    const hasFilters = appData.userPreferences.selectedClients.length > 0;
    const selectedGroup = appData.activeClientGroup;

    Object.entries(appData.clients).forEach(([id, client]) => {
        if (hasFilters && !appData.userPreferences.selectedClients.includes(id)) return;
        if (selectedGroup !== 'all' && client.group !== selectedGroup) return;
        if (client.oems) client.oems.forEach(oemId => allowedOems.add(oemId));
    });

    for (const [id, oem] of Object.entries(appData.oems)) {
        if (!allowedOems.has(id)) continue;

        const btn = document.createElement('button');
        btn.className = `tab-btn ${id === appData.activeOemId ? 'active' : ''}`;
        btn.textContent = oem.name;

        btn.onclick = async () => {
            appData.activeOemId = id;
            await fetchTrackingData(id);
            renderTabs();
            renderTable();
        };
        oemTabsContainer.appendChild(btn);
    }
};


// =============================================================
//  MODEL STATUS ICON
// =============================================================
const generateStatusIcon = (docId, model, clientId, clientName) => {
    const data = appData.tracking[docId];

    let linksHtml = '';
    if (data && (data.srp.link || data.researchPage.link)) {
        linksHtml += `<div class="link-container">`;
        if (data.srp.link) {
            linksHtml += `<a href="${data.srp.link}" target="_blank" class="external-link" title="Open SRP">SRP &#8599;</a>`;
        }
        if (data.researchPage.link) {
            linksHtml += `<a href="${data.researchPage.link}" target="_blank" class="external-link" title="Open Research Page">Res &#8599;</a>`;
        }
        linksHtml += `</div>`;
    }

    const buildHtml = (colorClass, symbol, title) => `
        <div class="cell-wrapper">
            <div class="status-indicator ${colorClass}" 
                 title="${title}" 
                 data-model="${model}" 
                 data-client="${clientId}"
                 data-clientname="${clientName}">${symbol}</div>
            ${linksHtml}
        </div>
    `;

    if (!data) return buildHtml('indicator-empty', '+', 'Click to Edit');

    const srp = data.srp;
    const res = data.researchPage;

    if (srp.discontinued) return buildHtml('indicator-gray', '!', 'Under Review: Discontinued');
    if (srp.noInventory) return buildHtml('indicator-gray', '!', 'Under Review: No Current Inventory');

    const currentMonth = new Date().getMonth();
    if (currentMonth >= 6 && !res.notAvailable && !res.isCreated) {
        return buildHtml('indicator-gray', '!', 'Under Review: Q3 Rollover (Needs New Model Page)');
    }

    const srpComplete = srp.isCreated && srp.isOptimized;
    const resComplete = res.isCreated;

    if (srpComplete && resComplete) return buildHtml('indicator-green', '&#10004;', 'Complete');
    if (!srp.isCreated && !res.isCreated) return buildHtml('indicator-red', '&#10006;', 'Missing: SRP and Research Page');

    let attentionItems = [];
    if (!srp.isCreated) attentionItems.push("SRP Missing");
    else if (!srp.isOptimized) attentionItems.push("SRP Not Optimized");
    if (!res.isCreated) attentionItems.push("Research Page Missing");

    return buildHtml('indicator-yellow', '&#9888;', `Needs Attention: ${attentionItems.join(', ')}`);
};


// =============================================================
//  MODEL DASHBOARD
// =============================================================
const missingPagesList = document.getElementById('missing-pages-list');
const stale30List = document.getElementById('stale-30-list');
const stale60List = document.getElementById('stale-60-list');
const stale90List = document.getElementById('stale-90-list');
const dashboardView = document.getElementById('dashboard-view');

const renderDashboard = () => {
    const missingGrouped = {};
    const stale30Grouped = {};
    const stale60Grouped = {};
    const stale90Grouped = {};
    const now = new Date();

    const hasFilters = appData.userPreferences.selectedClients.length > 0;

    Object.entries(appData.clients).forEach(([clientId, client]) => {
        if (hasFilters && !appData.userPreferences.selectedClients.includes(clientId)) return;
        if (!client.oems) return;

        missingGrouped[client.name] = [];
        stale30Grouped[client.name] = [];
        stale60Grouped[client.name] = [];
        stale90Grouped[client.name] = [];

        client.oems.forEach(oemId => {
            const oem = appData.oems[oemId];
            if (!oem) return;

            [...oem.models].sort((a, b) => a.localeCompare(b)).forEach(model => {
                const docId = `${clientId}_${oemId}_${model.replace(/\s+/g, '-').toLowerCase()}`;
                const data = appData.tracking[docId];

                const modelName = `<strong style="text-decoration: underline; color: var(--text-main);">${oem.name} ${model}</strong>`;
                const liAttributes = `class="dashboard-item" style="cursor: pointer; margin-bottom: 6px; display: block;" data-client="${clientId}" data-clientname="${client.name}" data-oem="${oemId}" data-model="${model}"`;

                if (!data) {
                    missingGrouped[client.name].push(`<li ${liAttributes}>${modelName} - <em style="color: var(--text-muted);">No data entered</em></li>`);
                } else {
                    let missingDetails = [];
                    if (!data.srp.isCreated) missingDetails.push("SRP");
                    if (!data.researchPage.isCreated) missingDetails.push("Research Page");

                    if (missingDetails.length > 0) {
                        missingGrouped[client.name].push(`<li ${liAttributes}>${modelName} - <em style="color: var(--text-muted);">Missing: ${missingDetails.join(', ')}</em></li>`);
                    }

                    if (data.lastUpdated) {
                        const lastUpdateDate = new Date(data.lastUpdated);
                        const diffDays = Math.ceil(Math.abs(now - lastUpdateDate) / (1000 * 60 * 60 * 24));

                        if (diffDays >= 90) {
                            stale90Grouped[client.name].push(`<li ${liAttributes}>${modelName} - <em style="color: var(--text-muted);">Updated ${diffDays} days ago</em></li>`);
                        } else if (diffDays >= 60) {
                            stale60Grouped[client.name].push(`<li ${liAttributes}>${modelName} - <em style="color: var(--text-muted);">Updated ${diffDays} days ago</em></li>`);
                        } else if (diffDays >= 30) {
                            stale30Grouped[client.name].push(`<li ${liAttributes}>${modelName} - <em style="color: var(--text-muted);">Updated ${diffDays} days ago</em></li>`);
                        }
                    }
                }
            });
        });
    });

    const buildAccordionHtml = (groupedData, badgeClass, emptyMessage) => {
        let html = '';
        let hasItems = false;
        for (const [clientName, items] of Object.entries(groupedData)) {
            if (items.length > 0) {
                hasItems = true;
                html += `
                    <details class="client-dropdown">
                        <summary>${clientName} <span class="alert-badge ${badgeClass}">${items.length}</span></summary>
                        <ul style="color: var(--text-muted); list-style-type: disc;">
                            ${items.join('')}
                        </ul>
                    </details>
                `;
            }
        }
        return hasItems ? html : `<p style="color: var(--status-green); font-size: 0.9rem; margin-bottom: 0;">${emptyMessage}</p>`;
    };

    missingPagesList.innerHTML = buildAccordionHtml(missingGrouped, '', '&#10004; No missing pages!');
    stale30List.innerHTML = buildAccordionHtml(stale30Grouped, 'warning', '&bull; Nothing to see here... Check back later!');
    stale60List.innerHTML = buildAccordionHtml(stale60Grouped, 'warning', '&bull; Nothing to see here... Check back later!');
    stale90List.innerHTML = buildAccordionHtml(stale90Grouped, '', '&bull; Nothing to see here... Check back later!');
};


// =============================================================
//  CLIENT GROUP DROPDOWN — MODELS
// =============================================================
const renderClientGroupDropdown = () => {
    const hasFilters = appData.userPreferences.selectedClients.length > 0;
    const uniqueGroups = new Set();

    Object.entries(appData.clients).forEach(([id, client]) => {
        if (hasFilters && !appData.userPreferences.selectedClients.includes(id)) return;
        if (client.group) uniqueGroups.add(client.group);
    });

    const currentSelection = clientSelect.value;
    let html = `<option value="all">All Configured Clients</option>`;
    Array.from(uniqueGroups).sort().forEach(group => {
        html += `<option value="${group}">${group}</option>`;
    });

    clientSelect.innerHTML = html;

    if (uniqueGroups.has(currentSelection) || currentSelection === 'all') {
        clientSelect.value = currentSelection;
    } else {
        clientSelect.value = 'all';
        appData.activeClientGroup = 'all';
    }
};

clientSelect.addEventListener('change', (e) => {
    appData.activeClientGroup = e.target.value;
    renderTabs();

    const validTabs = Array.from(document.querySelectorAll('.tab-btn'));
    if (validTabs.length > 0) {
        validTabs[0].click();
    } else {
        const tableBody = document.getElementById('table-body');
        const tableHead = document.getElementById('table-head');
        tableHead.innerHTML = '';
        tableBody.innerHTML = '<tr><td style="padding: 2rem; text-align: center; color: var(--text-muted);">No data available for this group.</td></tr>';
    }
});


// =============================================================
//  MODEL TABLE
// =============================================================
const renderTable = () => {
    const hasFilters = appData.userPreferences.selectedClients.length > 0;
    const selectedGroup = appData.activeClientGroup;

    const activeClients = Object.entries(appData.clients).filter(([id, client]) => {
        if (hasFilters && !appData.userPreferences.selectedClients.includes(id)) return false;
        if (selectedGroup !== 'all' && client.group !== selectedGroup) return false;
        return client.oems && client.oems.includes(appData.activeOemId);
    });

    let headerHtml = '<tr><th>Models</th>';
    activeClients.forEach(([id, client]) => {
        headerHtml += `<th>${client.name}</th>`;
    });
    headerHtml += '</tr>';
    tableHead.innerHTML = headerHtml;

    const activeOem = appData.oems[appData.activeOemId];
    let bodyHtml = '';

    if (activeOem && activeOem.models) {
        [...activeOem.models].sort((a, b) => a.localeCompare(b)).forEach(model => {
            bodyHtml += `<tr><th>${model}</th>`;
            activeClients.forEach(([clientId, client]) => {
                const docId = `${clientId}_${appData.activeOemId}_${model.replace(/\s+/g, '-').toLowerCase()}`;
                bodyHtml += `<td>${generateStatusIcon(docId, model, clientId, client.name)}</td>`;
            });
            bodyHtml += '</tr>';
        });
    }
    tableBody.innerHTML = bodyHtml;
};


// =============================================================
//  MODEL EDIT MODAL
// =============================================================
const editModal = document.getElementById('edit-modal');
const closeBtn = document.querySelector('.close-btn');
const modalTitle = document.getElementById('modal-title');
const modalSubtitle = document.getElementById('modal-subtitle');
const dynamicYearSpan = document.getElementById('dynamic-year');
const currentYear = new Date().getFullYear();

const srpCreated = document.getElementById('srp-created');
const srpOptimized = document.getElementById('srp-optimized');
const srpLink = document.getElementById('srp-link');
const srpNoInventory = document.getElementById('srp-no-inventory');
const srpDiscontinued = document.getElementById('srp-discontinued');
const researchCreated = document.getElementById('research-created');
const researchLink = document.getElementById('research-link');
const researchNotAvailable = document.getElementById('research-not-available');
const saveBtn = document.getElementById('save-btn');

dynamicYearSpan.textContent = currentYear;

let currentEditContext = { model: null, clientId: null, oemId: null };

const openEditModal = (clientId, clientName, oemId, model) => {
    currentEditContext = { model, clientId, oemId };

    const oemName = appData.oems[oemId].name;
    modalTitle.textContent = `Edit Status: ${model}`;
    modalSubtitle.textContent = `${oemName} - ${clientName}`;

    const docId = `${clientId}_${oemId}_${model.replace(/\s+/g, '-').toLowerCase()}`;
    const existingData = appData.tracking[docId];

    if (existingData) {
        srpCreated.checked = existingData.srp.isCreated || false;
        srpOptimized.checked = existingData.srp.isOptimized || false;
        srpLink.value = existingData.srp.link || "";
        srpNoInventory.checked = existingData.srp.noInventory || false;
        srpDiscontinued.checked = existingData.srp.discontinued || false;
        researchCreated.checked = existingData.researchPage.isCreated || false;
        researchLink.value = existingData.researchPage.link || "";
        researchNotAvailable.checked = existingData.researchPage.notAvailable || false;
    } else {
        document.querySelectorAll('.edit-section input[type="checkbox"]').forEach(cb => cb.checked = false);
        document.querySelectorAll('.edit-section input[type="url"]').forEach(input => input.value = '');
    }

    editModal.classList.remove('hidden');
};

// Table click → open model edit modal
tableBody.addEventListener('click', (e) => {
    if (e.target.classList.contains('status-indicator')) {
        const model = e.target.getAttribute('data-model');
        const clientId = e.target.getAttribute('data-client');
        const clientName = e.target.getAttribute('data-clientname');
        openEditModal(clientId, clientName, appData.activeOemId, model);
    }
});

// Dashboard click → open model edit modal
dashboardView.addEventListener('click', (e) => {
    const item = e.target.closest('.dashboard-item');
    if (item) {
        const clientId = item.getAttribute('data-client');
        const clientName = item.getAttribute('data-clientname');
        const oemId = item.getAttribute('data-oem');
        const model = item.getAttribute('data-model');
        openEditModal(clientId, clientName, oemId, model);
    }
});

const closeModal = () => {
    editModal.classList.add('hidden');
    currentEditContext = { model: null, clientId: null, oemId: null };
    document.querySelectorAll('.edit-section input').forEach(input => {
        if (input.type === 'checkbox') input.checked = false;
        if (input.type === 'url') input.value = '';
    });
};

closeBtn.addEventListener('click', closeModal);
editModal.addEventListener('click', (e) => { if (e.target === editModal) closeModal(); });

saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    const originalText = saveBtn.textContent;
    saveBtn.textContent = "Saving...";

    try {
        const docId = `${currentEditContext.clientId}_${currentEditContext.oemId}_${currentEditContext.model.replace(/\s+/g, '-').toLowerCase()}`;

        const trackingData = {
            clientId: currentEditContext.clientId,
            oemId: currentEditContext.oemId,
            model: currentEditContext.model,
            srp: {
                isCreated: srpCreated.checked,
                isOptimized: srpOptimized.checked,
                link: srpLink.value,
                noInventory: srpNoInventory.checked,
                discontinued: srpDiscontinued.checked
            },
            researchPage: {
                isCreated: researchCreated.checked,
                link: researchLink.value,
                notAvailable: researchNotAvailable.checked
            },
            lastUpdated: new Date().toISOString()
        };

        await setDoc(doc(db, "tracking", docId), trackingData);
        appData.tracking[docId] = trackingData;

        closeModal();
        renderTable();
        renderDashboard();

        console.log(`Successfully saved: ${currentEditContext.model}`);
    } catch (error) {
        console.error("Error saving tracking data:", error);
        alert("Failed to save changes. Please check your internet connection and try again.");
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
    }
});


// =============================================================
//  LOCATION — CLIENT GROUP DROPDOWN (new)
// =============================================================
const locationClientSelect = document.getElementById('location-client-select');

const renderLocationClientGroupDropdown = () => {
    const hasFilters = appData.userPreferences.selectedClients.length > 0;
    const uniqueGroups = new Set();

    Object.entries(appData.clients).forEach(([id, client]) => {
        if (hasFilters && !appData.userPreferences.selectedClients.includes(id)) return;
        if (client.group) uniqueGroups.add(client.group);
    });

    const currentSelection = locationClientSelect.value;
    let html = `<option value="all">All Configured Clients</option>`;
    Array.from(uniqueGroups).sort().forEach(group => {
        html += `<option value="${group}">${group}</option>`;
    });

    locationClientSelect.innerHTML = html;

    if (uniqueGroups.has(currentSelection) || currentSelection === 'all') {
        locationClientSelect.value = currentSelection;
    } else {
        locationClientSelect.value = 'all';
        appData.activeLocationClientGroup = 'all';
    }
};

locationClientSelect.addEventListener('change', (e) => {
    appData.activeLocationClientGroup = e.target.value;
    appData.activeLocationClientId = null; // Reset active tab so first tab is auto-selected
    renderLocationTabs();
    renderLocationDashboard();
});


// =============================================================
//  LOCATION — STATUS ICON
// =============================================================
const generateLocationStatusIcon = (docId, locationName, clientId, clientName) => {
    const data = appData.locations[docId];

    const buildHtml = (colorClass, symbol, title) => `
        <div class="status-indicator ${colorClass}"
             title="${title}"
             data-location="${locationName}"
             data-client="${clientId}"
             data-clientname="${clientName}"
             style="cursor:pointer;">${symbol}</div>
    `;

    if (!data) return buildHtml('indicator-empty', '+', 'Click to Edit');

    const geoType = data.geoType || 'secondary';
    const page = data.page;
    const isOptimized = page.isOptimized || false;

    if (geoType === 'primary') {
        // Primary GEO: no red missing state — only green (optimized) or yellow (not optimized)
        if (isOptimized) return buildHtml('indicator-green', '&#10004;', 'Primary GEO: Complete');
        return buildHtml('indicator-yellow', '&#9888;', 'Primary GEO: Needs Optimization');
    }

    // Secondary GEO: full green / yellow / red logic
    const isCreated = page.isCreated || false;
    if (isCreated && isOptimized) return buildHtml('indicator-green', '&#10004;', 'Complete');
    if (!isCreated) return buildHtml('indicator-red', '&#10006;', 'Missing: Location Page');
    return buildHtml('indicator-yellow', '&#9888;', 'Needs Attention: Page Not Optimized');
};


// =============================================================
//  LOCATION — CLIENT TABS (new)
// =============================================================
const renderLocationTabs = () => {
    const tabsContainer = document.getElementById('location-tabs-container');
    if (!tabsContainer) return;

    tabsContainer.innerHTML = '';

    const hasFilters = appData.userPreferences.selectedClients.length > 0;
    const selectedGroup = appData.activeLocationClientGroup;

    // Build filtered client list in the same order as appData.clients
    const activeClients = Object.entries(appData.clients).filter(([id, client]) => {
        if (hasFilters && !appData.userPreferences.selectedClients.includes(id)) return false;
        if (selectedGroup !== 'all' && client.group !== selectedGroup) return false;
        return true;
    });

    if (activeClients.length === 0) {
        renderLocationCards(); // Will show empty state
        return;
    }

    // Auto-select first client if none active or active client no longer in list
    const validIds = activeClients.map(([id]) => id);
    if (!appData.activeLocationClientId || !validIds.includes(appData.activeLocationClientId)) {
        appData.activeLocationClientId = activeClients[0][0];
    }

    // Build tabs
    activeClients.forEach(([clientId, client]) => {
        const btn = document.createElement('button');
        btn.className = `tab-btn ${clientId === appData.activeLocationClientId ? 'active' : ''}`;
        btn.textContent = client.name;

        btn.onclick = () => {
            appData.activeLocationClientId = clientId;
            renderLocationTabs();
            renderLocationCards();
        };

        tabsContainer.appendChild(btn);
    });

    // Render the active client's table
    renderLocationCards();
};


// =============================================================
//  LOCATION — RENDER ACTIVE CLIENT TABLE (updated)
// =============================================================
const renderLocationCards = () => {
    const container = document.getElementById('location-cards-container');
    const emptyState = document.getElementById('location-empty-state');

    // No active client selected yet
    if (!appData.activeLocationClientId || !appData.clients[appData.activeLocationClientId]) {
        container.innerHTML = '';
        container.appendChild(emptyState);
        emptyState.style.display = 'flex';
        return;
    }

    const clientId = appData.activeLocationClientId;
    const client = appData.clients[clientId];
    const locations = client.locations || [];

    emptyState.style.display = 'none';

    if (locations.length === 0) {
        container.innerHTML = `
            <div class="location-card-empty" style="padding: 3rem; text-align: center; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 8px; color: var(--text-muted); font-style: italic;">
                No locations added yet for <strong style="color: var(--text-main);">${client.name}</strong>. Click "+ Add Location" to get started.
            </div>
        `;
        container.appendChild(emptyState);
        return;
    }

    let html = `
        <div class="table-container">
            <table class="location-card-table">
                <thead>
                    <tr>
                        <th class="col-location">Location</th>
                        <th class="col-status">Status</th>
                        <th class="col-link">Page Link</th>
                        <th class="col-actions">Remove</th>
                    </tr>
                </thead>
                <tbody>
    `;

    locations.forEach(locationName => {
        const docId = `${clientId}_${locationName.replace(/\s+/g, '-').toLowerCase()}`;
        const data = appData.locations[docId];
        const link = data && data.page && data.page.link ? data.page.link : null;
        const geoType = data?.geoType || null;

        const geoBadge = geoType
            ? `<span style="font-size: 0.7rem; font-weight: 600; padding: 1px 6px; border-radius: 4px; margin-left: 6px; background: ${geoType === 'primary' ? 'rgba(37,99,235,0.1)' : 'rgba(107,114,128,0.1)'}; color: ${geoType === 'primary' ? 'var(--primary-color)' : 'var(--text-muted)'};">${geoType === 'primary' ? 'Primary' : 'Secondary'}</span>`
            : '';

        const linkHtml = link
            ? `<a href="${link}" target="_blank" class="location-page-link" title="${link}">
                   <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                       <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                       <polyline points="15 3 21 3 21 9"></polyline>
                       <line x1="10" y1="14" x2="21" y2="3"></line>
                   </svg>
               </a>`
            : `<span style="color: var(--text-muted); font-size: 0.8rem; font-style: italic;">—</span>`;

        html += `
            <tr>
                <td>${locationName}${geoBadge}</td>
                <td style="text-align:center;">
                    ${generateLocationStatusIcon(docId, locationName, clientId, client.name)}
                </td>
                <td>${linkHtml}</td>
                <td style="text-align:center;">
                    <button class="btn-remove-location"
                            data-clientid="${clientId}"
                            data-location="${locationName}"
                            title="Remove ${locationName}">
                        &times;
                    </button>
                </td>
            </tr>
        `;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
    container.appendChild(emptyState);
};


// =============================================================
//  LOCATION — CARDS CLICK DELEGATION (new)
// =============================================================
const locationCardsContainer = document.getElementById('location-cards-container');

locationCardsContainer.addEventListener('click', async (e) => {

    // 1. Status indicator → open edit modal
    if (e.target.classList.contains('status-indicator')) {
        const locationName = e.target.getAttribute('data-location');
        const clientId = e.target.getAttribute('data-client');
        const clientName = e.target.getAttribute('data-clientname');
        openLocationEditModal(clientId, clientName, locationName);
        return;
    }

    // 2. Remove button → confirm and delete
    if (e.target.classList.contains('btn-remove-location')) {
        const clientId = e.target.getAttribute('data-clientid');
        const locationName = e.target.getAttribute('data-location');
        await removeLocation(clientId, locationName);
    }
});


// =============================================================
//  LOCATION — EDIT MODAL
// =============================================================
const locationEditModal = document.getElementById('location-edit-modal');
const locationModalTitle = document.getElementById('location-modal-title');
const locationModalSubtitle = document.getElementById('location-modal-subtitle');
const locationSaveBtn = document.getElementById('location-save-btn');
const closeLocationEditBtn = document.querySelector('.close-location-edit-btn');

// GEO type radio buttons and field sections
const geoPrimaryRadio = document.getElementById('geo-primary');
const geoSecondaryRadio = document.getElementById('geo-secondary');
const locationPrimaryFields = document.getElementById('location-primary-fields');
const locationSecondaryFields = document.getElementById('location-secondary-fields');

// Primary GEO fields
const locationPrimaryOptimized = document.getElementById('location-primary-optimized');
const locationPrimaryLink = document.getElementById('location-primary-link');

// Secondary GEO fields
const locationCreated = document.getElementById('location-created');
const locationOptimized = document.getElementById('location-optimized');
const locationLink = document.getElementById('location-link');

let currentLocationEditContext = { clientId: null, clientName: null, locationName: null };

// Show/hide the correct field section when GEO type changes
const onGeoTypeChange = () => {
    const isPrimary = geoPrimaryRadio.checked;
    locationPrimaryFields.classList.toggle('hidden', !isPrimary);
    locationSecondaryFields.classList.toggle('hidden', isPrimary);
};

geoPrimaryRadio.addEventListener('change', onGeoTypeChange);
geoSecondaryRadio.addEventListener('change', onGeoTypeChange);

const openLocationEditModal = (clientId, clientName, locationName) => {
    currentLocationEditContext = { clientId, clientName, locationName };

    locationModalTitle.textContent = `Edit Status: ${locationName}`;
    locationModalSubtitle.textContent = clientName;

    const docId = `${clientId}_${locationName.replace(/\s+/g, '-').toLowerCase()}`;
    const existingData = appData.locations[docId];

    // Determine saved GEO type, defaulting to secondary for new/unknown entries
    const savedGeoType = existingData?.geoType || 'secondary';

    // Pre-select the correct radio
    geoPrimaryRadio.checked = savedGeoType === 'primary';
    geoSecondaryRadio.checked = savedGeoType === 'secondary';

    // Show the correct fields section
    onGeoTypeChange();

    if (existingData && existingData.page) {
        if (savedGeoType === 'primary') {
            locationPrimaryOptimized.checked = existingData.page.isOptimized || false;
            locationPrimaryLink.value = existingData.page.link || "";
            // Clear secondary fields
            locationCreated.checked = false;
            locationOptimized.checked = false;
            locationLink.value = "";
        } else {
            locationCreated.checked = existingData.page.isCreated || false;
            locationOptimized.checked = existingData.page.isOptimized || false;
            locationLink.value = existingData.page.link || "";
            // Clear primary fields
            locationPrimaryOptimized.checked = false;
            locationPrimaryLink.value = "";
        }
    } else {
        // No existing data — clear everything
        locationPrimaryOptimized.checked = false;
        locationPrimaryLink.value = "";
        locationCreated.checked = false;
        locationOptimized.checked = false;
        locationLink.value = "";
    }

    locationEditModal.classList.remove('hidden');
};

const closeLocationEditModal = () => {
    locationEditModal.classList.add('hidden');
    currentLocationEditContext = { clientId: null, clientName: null, locationName: null };
    // Reset all fields
    geoPrimaryRadio.checked = false;
    geoSecondaryRadio.checked = false;
    locationPrimaryFields.classList.add('hidden');
    locationSecondaryFields.classList.add('hidden');
    locationPrimaryOptimized.checked = false;
    locationPrimaryLink.value = "";
    locationCreated.checked = false;
    locationOptimized.checked = false;
    locationLink.value = "";
};

closeLocationEditBtn.addEventListener('click', closeLocationEditModal);
locationEditModal.addEventListener('click', (e) => {
    if (e.target === locationEditModal) closeLocationEditModal();
});

locationSaveBtn.addEventListener('click', async () => {
    // Validate a GEO type has been selected
    if (!geoPrimaryRadio.checked && !geoSecondaryRadio.checked) {
        alert("Please select a GEO type before saving.");
        return;
    }

    locationSaveBtn.disabled = true;
    const originalText = locationSaveBtn.textContent;
    locationSaveBtn.textContent = "Saving...";

    try {
        const { clientId, locationName } = currentLocationEditContext;
        const docId = `${clientId}_${locationName.replace(/\s+/g, '-').toLowerCase()}`;
        const geoType = geoPrimaryRadio.checked ? 'primary' : 'secondary';

        const locationData = {
            clientId,
            locationName,
            geoType,
            page: geoType === 'primary'
                ? {
                    isOptimized: locationPrimaryOptimized.checked,
                    link: locationPrimaryLink.value.trim()
                }
                : {
                    isCreated: locationCreated.checked,
                    isOptimized: locationOptimized.checked,
                    link: locationLink.value.trim()
                },
            lastUpdated: new Date().toISOString()
        };

        await setDoc(doc(db, "locations", docId), locationData);
        appData.locations[docId] = locationData;

        closeLocationEditModal();
        renderLocationCards();
        renderLocationDashboard();

        console.log(`Successfully saved location: ${locationName} (${geoType})`);
    } catch (error) {
        console.error("Error saving location data:", error);
        alert("Failed to save. Please check your connection and try again.");
    } finally {
        locationSaveBtn.disabled = false;
        locationSaveBtn.textContent = originalText;
    }
});

// Location dashboard click → open location edit modal
const locationDashboardView = document.getElementById('location-dashboard-view');
locationDashboardView.addEventListener('click', (e) => {
    const item = e.target.closest('.dashboard-item');
    if (item) {
        const clientId = item.getAttribute('data-client');
        const clientName = item.getAttribute('data-clientname');
        const locationName = item.getAttribute('data-location');
        openLocationEditModal(clientId, clientName, locationName);
    }
});


// =============================================================
//  LOCATION — ADD LOCATION BUTTON (tab bar)
// =============================================================
const addLocationBtn = document.getElementById('add-location-btn');

addLocationBtn.addEventListener('click', () => {
    if (!appData.activeLocationClientId) return;
    const client = appData.clients[appData.activeLocationClientId];
    if (!client) return;
    openAddLocationModal(appData.activeLocationClientId, client.name);
});


// =============================================================
//  LOCATION — ADD MODAL
// =============================================================
const addLocationModal = document.getElementById('add-location-modal');
const addLocationClientName = document.getElementById('add-location-client-name');
const saveNewLocationBtn = document.getElementById('save-new-location-btn');
const closeAddLocationBtn = document.querySelector('.close-add-location-btn');
const locationInputList = document.getElementById('location-input-list');
const addLocationRowBtn = document.getElementById('add-location-row-btn');

let currentAddLocationClientId = null;

const addLocationInputRow = () => {
    createInputRow(locationInputList, 'e.g. Baton Rouge', () => {
        addLocationInputRow();
    });
};

const openAddLocationModal = (clientId, clientName) => {
    currentAddLocationClientId = clientId;
    addLocationClientName.textContent = clientName;
    locationInputList.innerHTML = '';
    addLocationInputRow(); // Start with one blank row
    addLocationModal.classList.remove('hidden');
};

const closeAddLocationModal = () => {
    addLocationModal.classList.add('hidden');
    currentAddLocationClientId = null;
    locationInputList.innerHTML = '';
};

closeAddLocationBtn.addEventListener('click', closeAddLocationModal);
addLocationModal.addEventListener('click', (e) => {
    if (e.target === addLocationModal) closeAddLocationModal();
});

addLocationRowBtn.addEventListener('click', () => addLocationInputRow());

saveNewLocationBtn.addEventListener('click', async () => {
    const values = getInputListValues(locationInputList);
    if (values.length === 0) return alert("Please enter at least one location name.");

    const client = appData.clients[currentAddLocationClientId];
    const existingLocations = client.locations || [];

    // Duplicate check against existing locations
    const duplicates = values.filter(v =>
        existingLocations.some(l => l.toLowerCase() === v.toLowerCase())
    );
    if (duplicates.length > 0) {
        return alert(`The following location(s) already exist for ${client.name}:\n• ${duplicates.join('\n• ')}`);
    }

    // Duplicate check within the entered list itself
    const uniqueValues = [...new Set(values.map(v => v.toLowerCase()))];
    if (uniqueValues.length < values.length) {
        return alert("Your list contains duplicate entries. Please remove them before saving.");
    }

    try {
        saveNewLocationBtn.textContent = "Saving...";
        saveNewLocationBtn.disabled = true;

        const clientRef = doc(db, "clients", currentAddLocationClientId);
        await updateDoc(clientRef, { locations: arrayUnion(...values) });

        if (!client.locations) client.locations = [];
        values.forEach(v => client.locations.push(v));

        closeAddLocationModal();
        renderLocationCards();

        console.log(`Added ${values.length} location(s) to ${client.name}`);
    } catch (error) {
        console.error("Error adding locations:", error);
        alert("Failed to add locations. Please try again.");
    } finally {
        saveNewLocationBtn.textContent = "Save Locations";
        saveNewLocationBtn.disabled = false;
    }
});


// =============================================================
//  LOCATION — REMOVE (new)
// =============================================================
const removeLocation = async (clientId, locationName) => {
    const client = appData.clients[clientId];
    const confirmed = confirm(`Remove "${locationName}" from ${client.name}?\n\nThis will also delete all tracking data for this location. This cannot be undone.`);
    if (!confirmed) return;

    try {
        // 1. Remove from client's locations array in Firestore
        const clientRef = doc(db, "clients", clientId);
        await updateDoc(clientRef, { locations: arrayRemove(locationName) });

        // 2. Delete the tracking document from the locations collection
        const docId = `${clientId}_${locationName.replace(/\s+/g, '-').toLowerCase()}`;
        await deleteDoc(doc(db, "locations", docId));

        // 3. Update local memory
        client.locations = client.locations.filter(l => l !== locationName);
        delete appData.locations[docId];

        renderLocationCards();
        renderLocationDashboard();

        console.log(`Removed location "${locationName}" from ${client.name}`);
    } catch (error) {
        console.error("Error removing location:", error);
        alert("Failed to remove location. Please try again.");
    }
};


// =============================================================
//  LOCATION — DASHBOARD (new)
// =============================================================
const renderLocationDashboard = () => {
    const missingGrouped = {};
    const stale30Grouped = {};
    const stale60Grouped = {};
    const stale90Grouped = {};
    const now = new Date();

    const hasFilters = appData.userPreferences.selectedClients.length > 0;

    Object.entries(appData.clients).forEach(([clientId, client]) => {
        if (hasFilters && !appData.userPreferences.selectedClients.includes(clientId)) return;

        missingGrouped[client.name] = [];
        stale30Grouped[client.name] = [];
        stale60Grouped[client.name] = [];
        stale90Grouped[client.name] = [];

        // Client has no locations at all — flag it as missing
        if (!client.locations || client.locations.length === 0) {
            const liAttributes = `class="dashboard-item" style="cursor: pointer; margin-bottom: 6px; display: block;" data-client="${clientId}" data-clientname="${client.name}" data-location=""`;
            missingGrouped[client.name].push(`<li ${liAttributes}><strong style="color: var(--text-main);">${client.name}</strong> - <em style="color: var(--text-muted);">No locations configured</em></li>`);
            return;
        }

        client.locations.forEach(locationName => {
            const docId = `${clientId}_${locationName.replace(/\s+/g, '-').toLowerCase()}`;
            const data = appData.locations[docId];
            const geoType = data?.geoType || 'secondary';
            const isPrimary = geoType === 'primary';

            const geoLabel = isPrimary ? ' <span style="font-size:0.75rem; color: var(--primary-color); font-weight:600;">[Primary]</span>' : '';
            const displayName = `<strong style="text-decoration: underline; color: var(--text-main);">${locationName}</strong>${geoLabel}`;
            const liAttributes = `class="dashboard-item" style="cursor: pointer; margin-bottom: 6px; display: block;" data-client="${clientId}" data-clientname="${client.name}" data-location="${locationName}"`;

            if (!data) {
                missingGrouped[client.name].push(`<li ${liAttributes}>${displayName} - <em style="color: var(--text-muted);">No data entered</em></li>`);
            } else {
                // Missing check — Primary GEO only flags if not optimized, Secondary flags if not created
                if (isPrimary && !data.page.isOptimized) {
                    missingGrouped[client.name].push(`<li ${liAttributes}>${displayName} - <em style="color: var(--text-muted);">Needs Optimization</em></li>`);
                } else if (!isPrimary && !data.page.isCreated) {
                    missingGrouped[client.name].push(`<li ${liAttributes}>${displayName} - <em style="color: var(--text-muted);">Missing: Location Page</em></li>`);
                }

                // Staleness — Primary GEO only appears in 90+ bucket
                if (data.lastUpdated) {
                    const lastUpdateDate = new Date(data.lastUpdated);
                    const diffDays = Math.ceil(Math.abs(now - lastUpdateDate) / (1000 * 60 * 60 * 24));

                    if (diffDays >= 90) {
                        stale90Grouped[client.name].push(`<li ${liAttributes}>${displayName} - <em style="color: var(--text-muted);">Updated ${diffDays} days ago</em></li>`);
                    } else if (!isPrimary && diffDays >= 60) {
                        stale60Grouped[client.name].push(`<li ${liAttributes}>${displayName} - <em style="color: var(--text-muted);">Updated ${diffDays} days ago</em></li>`);
                    } else if (!isPrimary && diffDays >= 30) {
                        stale30Grouped[client.name].push(`<li ${liAttributes}>${displayName} - <em style="color: var(--text-muted);">Updated ${diffDays} days ago</em></li>`);
                    }
                }
            }
        });
    });

    const buildAccordionHtml = (groupedData, badgeClass, emptyMessage) => {
        let html = '';
        let hasItems = false;
        for (const [clientName, items] of Object.entries(groupedData)) {
            if (items.length > 0) {
                hasItems = true;
                html += `
                    <details class="client-dropdown">
                        <summary>${clientName} <span class="alert-badge ${badgeClass}">${items.length}</span></summary>
                        <ul style="color: var(--text-muted); list-style-type: disc;">
                            ${items.join('')}
                        </ul>
                    </details>
                `;
            }
        }
        return hasItems ? html : `<p style="color: var(--status-green); font-size: 0.9rem; margin-bottom: 0;">${emptyMessage}</p>`;
    };

    document.getElementById('location-missing-pages-list').innerHTML =
        buildAccordionHtml(missingGrouped, '', '&#10004; No missing location pages!');
    document.getElementById('location-stale-30-list').innerHTML =
        buildAccordionHtml(stale30Grouped, 'warning', '&bull; Nothing to see here... Check back later!');
    document.getElementById('location-stale-60-list').innerHTML =
        buildAccordionHtml(stale60Grouped, 'warning', '&bull; Nothing to see here... Check back later!');
    document.getElementById('location-stale-90-list').innerHTML =
        buildAccordionHtml(stale90Grouped, '', '&bull; Nothing to see here... Check back later!');
};