// DOM elements
const elements = {
    colorNormalStart: document.getElementById('colorNormalStart'),
    colorNormalEnd: document.getElementById('colorNormalEnd'),
    colorWarningStart: document.getElementById('colorWarningStart'),
    colorWarningEnd: document.getElementById('colorWarningEnd'),
    colorDangerStart: document.getElementById('colorDangerStart'),
    colorDangerEnd: document.getElementById('colorDangerEnd'),
    resetColorsBtn: document.getElementById('resetColorsBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    coffeeBtn: document.getElementById('coffeeBtn'),
    minimizeBtn: document.getElementById('minimizeBtn'),
    closeBtn: document.getElementById('closeBtn')
};

// Initialize
async function init() {
    setupEventListeners();

    // Load and apply color preferences
    const colorPrefs = await window.electronAPI.getColorPreferences();
    loadColorPickerValues(colorPrefs);
}

// Event Listeners
function setupEventListeners() {
    // Color picker event listeners
    const colorInputs = [
        elements.colorNormalStart,
        elements.colorNormalEnd,
        elements.colorWarningStart,
        elements.colorWarningEnd,
        elements.colorDangerStart,
        elements.colorDangerEnd
    ];

    colorInputs.forEach(input => {
        input.addEventListener('change', async () => {
            await saveCurrentColors();
        });
    });

    elements.resetColorsBtn.addEventListener('click', async () => {
        const defaults = {
            normal: { start: '#8b5cf6', end: '#a78bfa' },
            warning: { start: '#f59e0b', end: '#fbbf24' },
            danger: { start: '#ef4444', end: '#f87171' }
        };
        await window.electronAPI.setColorPreferences(defaults);
        loadColorPickerValues(defaults);
        // Notify main window to update colors immediately
        await window.electronAPI.notifyColorChange(defaults);
    });

    elements.logoutBtn.addEventListener('click', async () => {
        await window.electronAPI.deleteCredentials();
        window.close();
        window.electronAPI.openLogin();
    });

    elements.coffeeBtn.addEventListener('click', () => {
        window.electronAPI.openExternal('https://paypal.me/SlavomirDurej?country.x=GB&locale.x=en_GB');
    });

    // Window controls
    elements.minimizeBtn.addEventListener('click', () => {
        window.electronAPI.minimizeWindow();
    });

    elements.closeBtn.addEventListener('click', () => {
        window.close();
    });
}

// Helper functions
function loadColorPickerValues(prefs) {
    elements.colorNormalStart.value = prefs.normal.start;
    elements.colorNormalEnd.value = prefs.normal.end;
    elements.colorWarningStart.value = prefs.warning.start;
    elements.colorWarningEnd.value = prefs.warning.end;
    elements.colorDangerStart.value = prefs.danger.start;
    elements.colorDangerEnd.value = prefs.danger.end;
}

async function saveCurrentColors() {
    const prefs = {
        normal: {
            start: elements.colorNormalStart.value,
            end: elements.colorNormalEnd.value
        },
        warning: {
            start: elements.colorWarningStart.value,
            end: elements.colorWarningEnd.value
        },
        danger: {
            start: elements.colorDangerStart.value,
            end: elements.colorDangerEnd.value
        }
    };

    await window.electronAPI.setColorPreferences(prefs);
    // Notify main window to update colors
    await window.electronAPI.notifyColorChange(prefs);
}

// Start the application
init();
