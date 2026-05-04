// 1. Import Firebase Core and Auth modules from the web
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, setDoc, getDoc, query, where, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

// 2. YOUR FIREBASE CONFIGURATION (Paste your keys here!)
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

// --- LOGIN / LOGOUT BUTTON LOGIC ---
const loginBtn = document.getElementById('login-btn');

loginBtn.addEventListener('click', () => {
    // Check if the user is currently logged in
    if (appData.currentUserUid) {
        // They are logged in, so perform a Sign Out
        signOut(auth).then(() => {
            console.log("Successfully logged out.");
            // The onAuthStateChanged listener will automatically handle hiding the UI!
        }).catch((error) => {
            console.error("Error signing out:", error);
            alert("Failed to sign out. Please try again.");
        });
    } else {
        // They are logged out, so perform a Sign In
        signInWithPopup(auth, provider).catch((error) => {
            console.error("Error signing in:", error);
        });
    }
});

// --- AUTHENTICATION LISTENER ---
onAuthStateChanged(auth, async (user) => {
    const dashboardTitle = document.getElementById('dashboard-title');
    const loader = document.getElementById('loading-overlay');
    const settingsBtn = document.getElementById('settings-btn'); // Gear icon

    if (user) {
        // User is signed in
        document.body.classList.remove('logged-out'); 
        appData.currentUserUid = user.uid;
        document.getElementById('login-btn').textContent = 'Log Out';
        
        // Show the settings gear
        if (settingsBtn) settingsBtn.classList.remove('hidden');

        // Personalize Greeting
        const firstName = user.displayName ? user.displayName.split(' ')[0] : 'User';
        if (dashboardTitle) dashboardTitle.textContent = `Welcome, ${firstName}!`;

        // Load data
        await loadUserData(user.uid);
        await loadMasterData();
    } else {
        // User is signed out
        document.body.classList.add('logged-out'); 
        appData.currentUserUid = null;
        document.getElementById('login-btn').textContent = 'Log in with Google';
        
        if (dashboardTitle) dashboardTitle.textContent = 'Dashboard';
        
        // Hide settings gear
        if (settingsBtn) settingsBtn.classList.add('hidden');

        // Kill loader on logout
        if (loader) loader.classList.add('fade-out');
    }
});

const clientSelect = document.getElementById('client-select');
// --- APP STATE ---
// We store our fetched data here so we don't have to constantly ask Firebase for it
const appData = {
    oems: {},
    clients: {},
    tracking: {},
    activeOemId: null,
    currentUserUid: null,
    userPreferences: { selectedClients: [] },
    activeClientGroup: 'all'
};

// --- DOM ELEMENTS FOR SETTINGS ---
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.querySelector('.close-settings-btn');
const clientSelectionList = document.getElementById('client-selection-list');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const clearSettingsBtn = document.getElementById('clear-settings-btn');
const clientSearch = document.getElementById('client-search');
const selectedClientsList = document.getElementById('selected-clients-list');
const selectedCount = document.getElementById('selected-count');

// --- DYNAMIC SELECTED CLIENTS UI ---
const updateSelectedClientsUI = () => {
    const checkboxes = document.querySelectorAll('.client-filter-cb:checked');
    selectedCount.textContent = checkboxes.length;
    
    if (checkboxes.length === 0) {
        selectedClientsList.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem; font-style: italic; text-align: center; margin-top: 20px;">No clients selected.</p>';
        return;
    }

    let html = '';
    checkboxes.forEach(cb => {
        const clientName = cb.getAttribute('data-displayname'); // Safely gets the name
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; border-bottom: 1px solid var(--border-color); font-size: 0.9rem;">
                <span style="color: var(--text-main);">${clientName}</span>
                <button class="remove-client-btn" data-id="${cb.value}" title="Remove" style="background: none; border: none; color: var(--status-red); cursor: pointer; font-size: 1.25rem; font-weight: bold; line-height: 1; padding: 0 5px;">&times;</button>
            </div>
        `;
    });
    selectedClientsList.innerHTML = html;
};

// Listen for removal clicks on the left side
selectedClientsList.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-client-btn')) {
        const clientId = e.target.getAttribute('data-id');
        const cb = document.querySelector(`.client-filter-cb[value="${clientId}"]`);
        
        if (cb) {
            cb.checked = false; // Uncheck the box on the right
            
            // Also uncheck the "Select All" box for that group if it was checked
            const wrapper = cb.closest('.client-group-wrapper');
            const selectAllCb = wrapper.querySelector('.group-select-all');
            if (selectAllCb) selectAllCb.checked = false;
        }
        
        updateSelectedClientsUI(); // Instantly redraw the left side
    }
});

// --- SETTINGS ENGINE ---
const openSettingsModal = () => {
    // 1. Reset search bar
    clientSearch.value = '';

    // 2. Group clients by their 'group' property
    const groupedClients = {};
    Object.entries(appData.clients).forEach(([id, client]) => {
        const groupName = client.group || "Ungrouped";
        if (!groupedClients[groupName]) groupedClients[groupName] = [];
        groupedClients[groupName].push({ id, ...client });
    });

    // 3. Build the HTML
    let html = '';
    
    // Sort groups alphabetically
    const sortedGroups = Object.keys(groupedClients).sort();
    
    for (const groupName of sortedGroups) {
        const clients = groupedClients[groupName];
        
        // Wrapper for the whole group to help with search filtering
        html += `<div class="client-group-wrapper" data-group="${groupName}">`;
        
        // Group Header with "Select All" Checkbox
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #ccc; margin-top: 10px; padding-bottom: 4px;">
                <h4 style="margin: 0;">${groupName}</h4>
                <label style="font-size: 0.8rem; cursor: pointer; color: var(--primary-color); font-weight: 600;">
                    <input type="checkbox" class="group-select-all"> Select All
                </label>
            </div>
            <div class="group-clients-container">
        `;
        
        // Individual Client Checkboxes
        clients.forEach(c => {
            const isChecked = appData.userPreferences.selectedClients.includes(c.id) ? 'checked' : '';
            html += `
                <label class="client-label" style="display: block; margin: 5px 0 5px 10px; cursor: pointer;" data-name="${c.name.toLowerCase()}">
                    <input type="checkbox" class="client-filter-cb" value="${c.id}" data-displayname="${c.name}" ${isChecked}>
                    ${c.name}
                </label>
            `;
        });
        
        html += `</div></div>`; // Close containers
    }
    
    clientSelectionList.innerHTML = html;
    updateSelectedClientsUI();
    settingsModal.classList.remove('hidden');
};

const closeSettingsModal = () => settingsModal.classList.add('hidden');

settingsBtn.addEventListener('click', openSettingsModal);
closeSettingsBtn.addEventListener('click', closeSettingsModal);

// --- SEARCH BAR LOGIC (UPDATED FOR GROUP MATCHING) ---
clientSearch.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const groupWrappers = document.querySelectorAll('.client-group-wrapper');
    
    groupWrappers.forEach(wrapper => {
        // Grab the group name from the wrapper data attribute
        const groupName = wrapper.getAttribute('data-group').toLowerCase();
        const labels = wrapper.querySelectorAll('.client-label');
        
        // CONDITION 1: The Group Name matches the search term
        if (groupName.includes(searchTerm)) {
            // Show the wrapper and explicitly show EVERY client inside it
            wrapper.style.display = 'block';
            labels.forEach(label => {
                label.style.display = 'block';
            });
        } 
        // CONDITION 2: The Group Name does NOT match, so check individual clients
        else {
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
            
            // Hide the group entirely if no clients matched
            wrapper.style.display = hasVisibleClients ? 'block' : 'none';
        }
    });
});

// --- NEW: SELECT ALL LOGIC & INDIVIDUAL CHECKBOX LOGIC ---
clientSelectionList.addEventListener('change', (e) => {
    
    // 1. Handle the "Select All" checkbox
    if (e.target.classList.contains('group-select-all')) {
        const wrapper = e.target.closest('.client-group-wrapper');
        const checkboxes = wrapper.querySelectorAll('.client-filter-cb');
        
        checkboxes.forEach(cb => {
            // Only toggle checkboxes that are currently visible (respects the search filter!)
            const label = cb.closest('.client-label');
            if (label.style.display !== 'none') {
                cb.checked = e.target.checked;
            }
        });
    }

    updateSelectedClientsUI();
});

// --- SAVE / CLEAR CONFIGURATION ---
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
    applyFiltersAndRedraw();
});

// Master function to redraw everything when settings change
const applyFiltersAndRedraw = () => {
    renderClientGroupDropdown();
    renderTabs();
    
    const validTabs = Array.from(document.querySelectorAll('.tab-btn'));
    if (validTabs.length > 0 && !validTabs.some(tab => tab.classList.contains('active'))) {
        validTabs[0].click(); 
    } else {
        renderTable();
    }
    
    renderDashboard();
};

// --- DOM ELEMENTS ---
const oemTabsContainer = document.getElementById('oem-tabs');
const tableHead = document.querySelector('#tracking-table thead');
const tableBody = document.querySelector('#tracking-table tbody');

// --- DYNAMIC MODEL YEAR INJECTION ---
const dynamicModelYearSpan = document.getElementById('dynamic-model-year');

if (dynamicModelYearSpan) {
    // Get the current year and add 1
    const nextYear = new Date().getFullYear() + 1; 
    
    // Inject it into the HTML
    dynamicModelYearSpan.textContent = nextYear;
}

// --- ADD MODEL ENGINE ---
const addModelBtn = document.getElementById('add-model-btn');
const addModelModal = document.getElementById('add-model-modal');
const closeAddModelBtn = document.querySelector('.close-add-model-btn');
const newModelInput = document.getElementById('new-model-input');
const saveNewModelBtn = document.getElementById('save-new-model-btn');
const addModelOemName = document.getElementById('add-model-oem-name');

// 1. Open the Modal
addModelBtn.addEventListener('click', () => {
    if (!appData.activeOemId) return; // Failsafe if no tab is selected
    
    // Auto-fill the OEM name so they know exactly where they are adding it
    addModelOemName.textContent = appData.oems[appData.activeOemId].name;
    newModelInput.value = ''; // Clear the input
    addModelModal.classList.remove('hidden');
});

// 2. Close the Modal
closeAddModelBtn.addEventListener('click', () => {
    addModelModal.classList.add('hidden');
});

// 3. Save to Firebase
saveNewModelBtn.addEventListener('click', async () => {
    const newModel = newModelInput.value; // No formatting/trimming, as requested
    
    if (!newModel) return alert("Please enter a model name.");

    const activeOem = appData.oems[appData.activeOemId];
    
    // Duplicate Prevention Check (Case-insensitive so "mustang" catches "Mustang")
    const exists = activeOem.models.some(m => m.toLowerCase() === newModel.toLowerCase());
    if (exists) {
        return alert(`The model "${newModel}" already exists for ${activeOem.name}.`);
    }

    try {
        // Change button state to show loading
        saveNewModelBtn.textContent = "Saving...";
        saveNewModelBtn.disabled = true;

        // Push strictly to the models array in Firebase
        const oemRef = doc(db, "oems", appData.activeOemId);
        await updateDoc(oemRef, {
            models: arrayUnion(newModel)
        });
        
        // Push to local memory so we don't have to download the database again
        activeOem.models.push(newModel);
        
        // Redraw the matrix instantly
        renderTable(); 
        
        // Close and reset
        addModelModal.classList.add('hidden');
        saveNewModelBtn.textContent = "Save Model";
        saveNewModelBtn.disabled = false;

    } catch (error) {
        console.error("Error adding model:", error);
        alert("Failed to add model. Please try again.");
        saveNewModelBtn.textContent = "Save Model";
        saveNewModelBtn.disabled = false;
    }
});

// --- DARK MODE LOGIC ---
const themeToggleCb = document.getElementById('theme-toggle-cb');
const currentTheme = localStorage.getItem('app-theme') || 'light';

// Apply the saved theme and set the toggle position immediately on load
if (currentTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    themeToggleCb.checked = true;
} else {
    document.documentElement.setAttribute('data-theme', 'light');
    themeToggleCb.checked = false;
}

// Listen for the toggle switch changing
themeToggleCb.addEventListener('change', (e) => {
    if (e.target.checked) {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('app-theme', 'dark');
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('app-theme', 'light');
    }
});

const fetchTrackingData = async (oemId = null) => {
    console.log(oemId ? `Fetching data for OEM: ${oemId}` : "Fetching all data for Dashboard...");
    
    const selected = appData.userPreferences.selectedClients;
    if (selected.length === 0) return; // Don't fetch if no clients are selected

    let q;
    if (oemId) {
        // Optimization: Fetch only the active tab's data for the matrix
        q = query(
            collection(db, "tracking"), 
            where("clientId", "in", selected.slice(0, 30)), // Firebase limit
            where("oemId", "==", oemId)
        );
    } else {
        // Dashboard: Fetch everything for selected clients (handled in batches of 30)
        // Note: For now, we fetch all to ensure the Dashboard counts are accurate
        for (let i = 0; i < selected.length; i += 30) {
            const batch = selected.slice(i, i + 30);
            const dashboardQuery = query(collection(db, "tracking"), where("clientId", "in", batch));
            const snapshot = await getDocs(dashboardQuery);
            snapshot.forEach(doc => {
                appData.tracking[doc.id] = doc.data();
            });
        }
        return; // Exit early since we handled the batch loop
    }

    const snapshot = await getDocs(q);
    snapshot.forEach(doc => {
        appData.tracking[doc.id] = doc.data();
    });
};

// --- FETCH USER SETTINGS ---
const loadUserData = async (uid) => {
    try {
        console.log("Fetching user preferences...");
        const userDocRef = doc(db, "users", uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
            const data = userDocSnap.data();
            if (data.preferences && data.preferences.selectedClients) {
                // Apply their saved clients to the app memory
                appData.userPreferences.selectedClients = data.preferences.selectedClients;
            }
        } else {
            // If this is a brand new user logging in for the first time, 
            // create a blank profile for them in the database!
            await setDoc(userDocRef, {
                preferences: { selectedClients: [] }
            });
            appData.userPreferences.selectedClients = [];
        }
    } catch (error) {
        console.error("Error loading user data:", error);
    }
};

// --- MASTER DATA LOADER (FULL & FAIL-SAFE) ---
const loadMasterData = async () => {
    const loader = document.getElementById('loading-overlay');
    try {
        console.log("Starting Master Data sync...");
        
        // This fetches the "Global" data needed for the 30/60/90 lists
        await fetchTrackingData(); 

        renderClientGroupDropdown();
        renderTabs();

        // 1. Attempt to get the sync timestamp
        const metaRef = doc(db, "metadata", "last_updated");
        const metaSnap = await getDoc(metaRef);
        
        let remoteTime = null;
        if (metaSnap.exists()) {
            remoteTime = metaSnap.data().oem_client_sync;
        }

        const localTime = localStorage.getItem('last_sync_time');
        const cachedClients = localStorage.getItem('cached_clients');

        // 2. Decide: Use Cache or Fetch?
        // We only use cache if remoteTime exists, matches local, AND we actually have data
        if (remoteTime && remoteTime === localTime && cachedClients) {
            appData.oems = JSON.parse(localStorage.getItem('cached_oems'));
            appData.clients = JSON.parse(localStorage.getItem('cached_clients'));
            console.log("Optimization Active: Using cached Master Data.");
        } else {
            console.log("Syncing from Firebase (Either new data exists or no cache found)...");
            
            // Fetch OEMs
            const oemSnapshot = await getDocs(collection(db, "oems"));
            appData.oems = {}; // Clear to be safe
            oemSnapshot.forEach(doc => { appData.oems[doc.id] = doc.data(); });

            // Fetch Clients
            const clientSnapshot = await getDocs(collection(db, "clients"));
            appData.clients = {}; // Clear to be safe
            clientSnapshot.forEach(doc => { appData.clients[doc.id] = doc.data(); });

            // Update Cache
            localStorage.setItem('cached_oems', JSON.stringify(appData.oems));
            localStorage.setItem('cached_clients', JSON.stringify(appData.clients));
            if (remoteTime) localStorage.setItem('last_sync_time', remoteTime);
        }

        // 3. Always fetch tracking and render UI
        await fetchTrackingData();
        renderClientGroupDropdown();
        renderTabs();
        
        const validTabs = Array.from(document.querySelectorAll('.tab-btn'));
        if (validTabs.length > 0) {
            validTabs[0].click(); 
        } else {
            renderTable();
        }
        
        renderDashboard();

    } catch (error) {
        console.error("Critical Error in loadMasterData:", error);
    } finally {
        if (loader) loader.classList.add('fade-out');
    }
};

// --- 2. DRAW THE OEM TABS (UPDATED FOR DROPDOWN FILTERS) ---
const renderTabs = () => {
    const oemTabsContainer = document.getElementById('oem-tabs-container');
    if (!oemTabsContainer) return;

    oemTabsContainer.innerHTML = ''; 
    
    let allowedOems = new Set();
    const hasFilters = appData.userPreferences.selectedClients.length > 0;
    const selectedGroup = appData.activeClientGroup; // NEW: Grab the current dropdown value

    Object.entries(appData.clients).forEach(([id, client]) => {
        // 1. Settings filter check
        if (hasFilters && !appData.userPreferences.selectedClients.includes(id)) return;
        
        // 2. Dropdown group check (Skips clients not in the selected group)
        if (selectedGroup !== 'all' && client.group !== selectedGroup) return;

        // 3. Add this client's OEMs to the allowed list
        if (client.oems) client.oems.forEach(oemId => allowedOems.add(oemId));
    });

    // Draw only allowed tabs
    for (const [id, oem] of Object.entries(appData.oems)) {
        if (!allowedOems.has(id)) continue; 

        const btn = document.createElement('button');
        btn.className = `tab-btn ${id === appData.activeOemId ? 'active' : ''}`;
        btn.textContent = oem.name;
        
        btn.onclick = async () => {
            appData.activeOemId = id;
            
            // NEW: Fetch data for this specific OEM before drawing the table
            await fetchTrackingData(id); 
            
            renderTabs(); 
            renderTable(); 
        };
        oemTabsContainer.appendChild(btn);
    }
};

// --- 7. THE STATUS ENGINE ---
const generateStatusIcon = (docId, model, clientId, clientName) => {
    const data = appData.tracking[docId];
    
    // 1. Check for links and build the link HTML
    let linksHtml = '';
    if (data && (data.srp.link || data.researchPage.link)) {
        linksHtml += `<div class="link-container">`;
        
        if (data.srp.link) {
            // target="_blank" opens it in a new tab
            linksHtml += `<a href="${data.srp.link}" target="_blank" class="external-link" title="Open SRP">SRP &#8599;</a>`;
        }
        
        if (data.researchPage.link) {
            linksHtml += `<a href="${data.researchPage.link}" target="_blank" class="external-link" title="Open Research Page">Res &#8599;</a>`;
        }
        
        linksHtml += `</div>`;
    }

    // 2. Base HTML wrapper (Now includes the linksHtml!)
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

    // 3. No data exists yet
    if (!data) return buildHtml('indicator-empty', '+', 'Click to Edit');

    const srp = data.srp;
    const res = data.researchPage;

    // 4. OVERRIDE RULES
    if (srp.discontinued) {
        return buildHtml('indicator-gray', '!', 'Under Review: Discontinued');
    }
    if (srp.noInventory) {
        return buildHtml('indicator-gray', '!', 'Under Review: No Current Inventory');
    }

    // 5. Q3 ROLLOVER RULE
    const currentMonth = new Date().getMonth(); 
    if (currentMonth >= 6 && !res.notAvailable && !res.isCreated) {
        return buildHtml('indicator-gray', '!', 'Under Review: Q3 Rollover (Needs New Model Page)');
    }

    // 6. STANDARD CHECKS
    const srpComplete = srp.isCreated && srp.isOptimized;
    const resComplete = res.isCreated;

    if (srpComplete && resComplete) {
        return buildHtml('indicator-green', '&#10004;', 'Complete'); 
    } 
    
    if (!srp.isCreated && !res.isCreated) {
        return buildHtml('indicator-red', '&#10006;', 'Missing: SRP and Research Page'); 
    }

    // 7. PARTIAL COMPLETION
    let attentionItems = [];
    if (!srp.isCreated) attentionItems.push("SRP Missing");
    else if (!srp.isOptimized) attentionItems.push("SRP Not Optimized");
    if (!res.isCreated) attentionItems.push("Research Page Missing");

    const dynamicTitle = `Needs Attention: ${attentionItems.join(', ')}`;
    return buildHtml('indicator-yellow', '&#9888;', dynamicTitle); 
};

// --- DOM ELEMENTS FOR DASHBOARD ---
const missingPagesList = document.getElementById('missing-pages-list');
const stale30List = document.getElementById('stale-30-list');
const stale60List = document.getElementById('stale-60-list');
const stale90List = document.getElementById('stale-90-list');
const dashboardView = document.getElementById('dashboard-view');
const workspaceView = document.getElementById('workspace-view');

// --- 8. THE DASHBOARD ENGINE (WITH SETTINGS FILTERS & 30/60/90) ---
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

            oem.models.forEach(model => {
                const docId = `${clientId}_${oemId}_${model.replace(/\s+/g, '-').toLowerCase()}`;
                const data = appData.tracking[docId];
                
                // NEW: Added underline so it looks like a clickable link
                const modelName = `<strong style="text-decoration: underline; color: var(--text-main);">${oem.name} ${model}</strong>`;
                
                // NEW: Added cursor: pointer and margin so they are easy to click
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
                        const diffTime = Math.abs(now - lastUpdateDate);
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                        
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
    
    // We use a custom red badge class for the critical 90+ days
    const stale90Html = buildAccordionHtml(stale90Grouped, '', '&bull; Nothing to see here... Check back later!');
    stale90List.innerHTML = stale90Html.replace(/class="alert-badge "/g, 'class="alert-badge"');
};

// --- DYNAMIC CLIENT GROUP DROPDOWN ---
const renderClientGroupDropdown = () => {
    const hasFilters = appData.userPreferences.selectedClients.length > 0;
    const uniqueGroups = new Set();

    // 1. Find all unique groups for the allowed clients
    Object.entries(appData.clients).forEach(([id, client]) => {
        if (hasFilters && !appData.userPreferences.selectedClients.includes(id)) return;
        if (client.group) uniqueGroups.add(client.group);
    });

    // 2. Remember current selection (so it doesn't reset when we redraw)
    const currentSelection = clientSelect.value;
    
    // 3. Build HTML
    let html = `<option value="all">All Configured Clients</option>`;
    
    // Sort groups alphabetically for a cleaner UI
    Array.from(uniqueGroups).sort().forEach(group => {
        html += `<option value="${group}">${group}</option>`;
    });

    clientSelect.innerHTML = html;
    
    // 4. Restore selection or reset to 'all' if the previous group is no longer valid
    if (uniqueGroups.has(currentSelection) || currentSelection === 'all') {
        clientSelect.value = currentSelection;
    } else {
        clientSelect.value = 'all';
        appData.activeClientGroup = 'all';
    }
};

// Listen for dropdown changes
clientSelect.addEventListener('change', (e) => {
    appData.activeClientGroup = e.target.value;
    
    // 1. Redraw the tabs based on the new group selection
    renderTabs(); 
    
    // 2. Find all the newly drawn tabs
    const validTabs = Array.from(document.querySelectorAll('.tab-btn'));
    
    if (validTabs.length > 0) {
        // Automatically click the first available tab for this client group
        validTabs[0].click(); 
    } else {
        // Failsafe: If a group has absolutely no OEMs for some reason, clear the table
        const tableBody = document.getElementById('table-body');
        const tableHead = document.getElementById('table-head');
        tableHead.innerHTML = '';
        tableBody.innerHTML = '<tr><td style="padding: 2rem; text-align: center; color: var(--text-muted);">No data available for this group.</td></tr>';
    }
});

// --- 3. DRAW THE TABLE SKELETON (UPDATED FOR DROPDOWN) ---
const renderTable = () => {
    const hasFilters = appData.userPreferences.selectedClients.length > 0;
    const selectedGroup = appData.activeClientGroup; // Grab the dropdown value

    // A. Filter clients based on Settings, OEM, AND the Dropdown
    const activeClients = Object.entries(appData.clients).filter(([id, client]) => {
        // 1. Settings filter check
        if (hasFilters && !appData.userPreferences.selectedClients.includes(id)) return false;
        
        // 2. Dropdown group check
        if (selectedGroup !== 'all' && client.group !== selectedGroup) return false;
        
        // 3. OEM tab check
        return client.oems && client.oems.includes(appData.activeOemId);
    });

    // B. Build the Column Headers
    let headerHtml = '<tr><th>Models</th>';
    activeClients.forEach(([id, client]) => {
        headerHtml += `<th>${client.name}</th>`;
    });
    headerHtml += '</tr>';
    tableHead.innerHTML = headerHtml;

    // C. Build the Rows
    const activeOem = appData.oems[appData.activeOemId];
    let bodyHtml = '';
    
    if (activeOem && activeOem.models) {
        activeOem.models.forEach(model => {
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

// --- MODAL DOM ELEMENTS ---
const editModal = document.getElementById('edit-modal');
const closeBtn = document.querySelector('.close-btn');
const modalTitle = document.getElementById('modal-title');
const modalSubtitle = document.getElementById('modal-subtitle');
const dynamicYearSpan = document.getElementById('dynamic-year');
const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth(); // 0 = Jan, 6 = July (Q3)

// --- FORM INPUT ELEMENTS ---
const srpCreated = document.getElementById('srp-created');
const srpOptimized = document.getElementById('srp-optimized');
const srpLink = document.getElementById('srp-link');
const srpNoInventory = document.getElementById('srp-no-inventory');
const srpDiscontinued = document.getElementById('srp-discontinued');

const researchCreated = document.getElementById('research-created');
const researchLink = document.getElementById('research-link');
const researchNotAvailable = document.getElementById('research-not-available');
const saveBtn = document.getElementById('save-btn');

// Set the modal text immediately
dynamicYearSpan.textContent = currentYear;

// We will use this to remember which cell/dashboard item we are currently editing
let currentEditContext = { model: null, clientId: null, oemId: null }; // Added oemId!

// --- NEW: REUSABLE MODAL OPENER ---
const openEditModal = (clientId, clientName, oemId, model) => {
    // 1. Save context for the Save button
    currentEditContext = { model, clientId, oemId };

    // 2. Set the Modal Text
    const oemName = appData.oems[oemId].name;
    modalTitle.textContent = `Edit Status: ${model}`;
    modalSubtitle.textContent = `${oemName} - ${clientName}`;

    // 3. Fetch data if it exists
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

    // 4. Show the modal
    editModal.classList.remove('hidden');
};

// --- 4. TABLE CLICK LISTENER ---
tableBody.addEventListener('click', (e) => {
    if (e.target.classList.contains('status-indicator')) {
        const model = e.target.getAttribute('data-model');
        const clientId = e.target.getAttribute('data-client');
        const clientName = e.target.getAttribute('data-clientname');
        const oemId = appData.activeOemId; // Table always uses the active tab
        
        openEditModal(clientId, clientName, oemId, model);
    }
});

// --- 9. DASHBOARD CLICK LISTENER ---
dashboardView.addEventListener('click', (e) => {
    // Find the closest dashboard-item that was clicked
    const item = e.target.closest('.dashboard-item');
    if (item) {
        const clientId = item.getAttribute('data-client');
        const clientName = item.getAttribute('data-clientname');
        const oemId = item.getAttribute('data-oem');
        const model = item.getAttribute('data-model');
        
        openEditModal(clientId, clientName, oemId, model);
    }
});

// --- 5. MODAL CLOSE LOGIC ---
const closeModal = () => {
    editModal.classList.add('hidden');
    // Clear out the context and form inputs when closing
    currentEditContext = { model: null, clientId: null };
    document.querySelectorAll('.edit-section input').forEach(input => {
        if(input.type === 'checkbox') input.checked = false;
        if(input.type === 'url') input.value = '';
    });
};

// Close when clicking the "X"
closeBtn.addEventListener('click', closeModal);

// Close when clicking the grey background outside the modal
editModal.addEventListener('click', (e) => {
    if (e.target === editModal) closeModal();
});

// --- 6. SAVE UPDATES TO FIREBASE (WITH DEBOUNCING & OPTIMIZATION) ---
saveBtn.addEventListener('click', async () => {
    // 1. UI PROTECTION: Disable button immediately to prevent double-clicks
    saveBtn.disabled = true;
    const originalText = saveBtn.textContent;
    saveBtn.textContent = "Saving...";

    try {
        // 2. Create a unique ID using the context's oemId
        const docId = `${currentEditContext.clientId}_${currentEditContext.oemId}_${currentEditContext.model.replace(/\s+/g, '-').toLowerCase()}`;
        
        // 3. Package all form inputs into the JSON structure
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
            // The "Magic" field that drives your Dashboard 30/60/90 lists
            lastUpdated: new Date().toISOString()
        };

        // 4. Push to Firebase
        await setDoc(doc(db, "tracking", docId), trackingData);
        
        // 5. Update local memory so the UI changes instantly without a refresh
        appData.tracking[docId] = trackingData;
        
        // 6. Success! Close modal and refresh the views
        closeModal();
        renderTable();
        renderDashboard();
        
        console.log(`Successfully saved update for: ${currentEditContext.model}`);

    } catch (error) {
        // Handle database errors (like permission issues or connectivity loss)
        console.error("Error saving tracking data:", error);
        alert("Failed to save changes. Please check your internet connection and try again.");
    } finally {
        // 7. RESET: Re-enable the button regardless of success or failure
        // This ensures the button isn't stuck as "Saving..." if an error occurs.
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
    }
});