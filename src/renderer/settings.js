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
    closeBtn: document.getElementById('closeBtn'),
    // Tray icon elements
    trayDisplaySession: document.getElementById('trayDisplaySession'),
    trayDisplayWeekly: document.getElementById('trayDisplayWeekly'),
    trayUpdateInterval: document.getElementById('trayUpdateInterval'),
    trayUpdateValue: document.getElementById('trayUpdateValue'),
    trayShowText: document.getElementById('trayShowText'),
    trayShowTextLabel: document.getElementById('trayShowTextLabel'),
    trayColorNormalStart: document.getElementById('trayColorNormalStart'),
    trayColorNormalEnd: document.getElementById('trayColorNormalEnd'),
    trayColorWarningStart: document.getElementById('trayColorWarningStart'),
    trayColorWarningEnd: document.getElementById('trayColorWarningEnd'),
    trayColorDangerStart: document.getElementById('trayColorDangerStart'),
    trayColorDangerEnd: document.getElementById('trayColorDangerEnd'),
    resetTrayColorsBtn: document.getElementById('resetTrayColorsBtn'),
    // Static color toggles
    mainWindowStaticColor: document.getElementById('mainWindowStaticColor'),
    mainWindowStaticColorPicker: document.getElementById('mainWindowStaticColorPicker'),
    mainWindowStaticColorValue: document.getElementById('mainWindowStaticColorValue'),
    mainWindowGradientPickers: document.getElementById('mainWindowGradientPickers'),
    trayStaticColor: document.getElementById('trayStaticColor'),
    trayStaticColorPicker: document.getElementById('trayStaticColorPicker'),
    trayStaticColorValue: document.getElementById('trayStaticColorValue'),
    trayGradientPickers: document.getElementById('trayGradientPickers'),
    // Theme elements
    backgroundColorStart: document.getElementById('backgroundColorStart'),
    backgroundColorEnd: document.getElementById('backgroundColorEnd'),
    textColorPrimary: document.getElementById('textColorPrimary'),
    textColorSecondary: document.getElementById('textColorSecondary'),
    titleBarBackground: document.getElementById('titleBarBackground'),
    titleBarOpacity: document.getElementById('titleBarOpacity'),
    titleBarOpacityValue: document.getElementById('titleBarOpacityValue'),
    borderColor: document.getElementById('borderColor'),
    borderOpacity: document.getElementById('borderOpacity'),
    borderOpacityValue: document.getElementById('borderOpacityValue'),
    resetThemeBtn: document.getElementById('resetThemeBtn')
};

// Initialize
async function init() {
    setupEventListeners();
    setupCollapsibleSections();

    // Load and apply color preferences
    const colorPrefs = await window.electronAPI.getColorPreferences();
    loadColorPickerValues(colorPrefs);

    // Load and apply tray settings
    const traySettings = await window.electronAPI.getTraySettings();
    loadTraySettings(traySettings);

    // Load tray update interval
    const interval = await window.electronAPI.getTrayUpdateInterval();
    loadTrayUpdateInterval(interval);

    // Load theme settings
    await loadThemeSettings();

    // Apply theme to settings window
    const theme = await window.electronAPI.getThemeSettings();
    applyThemeToSettings(theme);

    // Listen for theme changes
    window.electronAPI.onThemeChanged((theme) => {
        applyThemeToSettings(theme);
    });
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

    // Tray icon event listeners
    elements.trayDisplaySession.addEventListener('change', saveTraySettings);
    elements.trayDisplayWeekly.addEventListener('change', saveTraySettings);

    elements.trayShowText.addEventListener('change', () => {
        elements.trayShowTextLabel.textContent = elements.trayShowText.checked ? 'Enabled' : 'Disabled';
        saveTraySettings();
    });

    const trayColorInputs = [
        elements.trayColorNormalStart,
        elements.trayColorNormalEnd,
        elements.trayColorWarningStart,
        elements.trayColorWarningEnd,
        elements.trayColorDangerStart,
        elements.trayColorDangerEnd
    ];

    trayColorInputs.forEach(input => {
        input.addEventListener('change', saveTraySettings);
    });

    elements.trayUpdateInterval.addEventListener('input', () => {
        elements.trayUpdateValue.textContent = elements.trayUpdateInterval.value;
    });

    elements.trayUpdateInterval.addEventListener('change', () => {
        window.electronAPI.setTrayUpdateInterval(parseInt(elements.trayUpdateInterval.value));
    });

    elements.resetTrayColorsBtn.addEventListener('click', async () => {
        const defaults = {
            displayMode: elements.trayDisplaySession.checked ? 'session' : 'weekly',
            showText: false,
            colors: {
                normal: { start: '#8b5cf6', end: '#a78bfa' },
                warning: { start: '#f59e0b', end: '#fbbf24' },
                danger: { start: '#ef4444', end: '#f87171' }
            }
        };
        await window.electronAPI.setTraySettings(defaults);
        loadTraySettings(defaults);
    });

    // Main Window static color toggle
    elements.mainWindowStaticColor.addEventListener('change', () => {
        const isStatic = elements.mainWindowStaticColor.checked;
        elements.mainWindowStaticColorPicker.style.display = isStatic ? 'block' : 'none';
        elements.mainWindowGradientPickers.style.display = isStatic ? 'none' : 'grid';
        saveCurrentColors();
    });

    elements.mainWindowStaticColorValue.addEventListener('change', saveCurrentColors);

    // Tray static color toggle
    elements.trayStaticColor.addEventListener('change', () => {
        const isStatic = elements.trayStaticColor.checked;
        elements.trayStaticColorPicker.style.display = isStatic ? 'block' : 'none';
        elements.trayGradientPickers.style.display = isStatic ? 'none' : 'grid';
        saveTraySettings();
    });

    elements.trayStaticColorValue.addEventListener('change', saveTraySettings);

    // Theme settings
    const themeInputs = [
        elements.backgroundColorStart,
        elements.backgroundColorEnd,
        elements.textColorPrimary,
        elements.textColorSecondary,
        elements.titleBarBackground,
        elements.borderColor
    ];

    themeInputs.forEach(input => {
        input.addEventListener('change', saveThemeSettings);
    });

    // Opacity sliders
    elements.titleBarOpacity.addEventListener('input', () => {
        elements.titleBarOpacityValue.textContent = elements.titleBarOpacity.value;
    });

    elements.titleBarOpacity.addEventListener('change', saveThemeSettings);

    elements.borderOpacity.addEventListener('input', () => {
        elements.borderOpacityValue.textContent = elements.borderOpacity.value;
    });

    elements.borderOpacity.addEventListener('change', saveThemeSettings);

    // Reset theme button
    elements.resetThemeBtn.addEventListener('click', resetTheme);
}

// Helper functions
function loadColorPickerValues(prefs) {
    // Check if static mode
    const isStatic = prefs.isStatic || false;
    elements.mainWindowStaticColor.checked = isStatic;

    if (isStatic) {
        // Load static color
        elements.mainWindowStaticColorValue.value = prefs.staticColor || '#8b5cf6';
        elements.mainWindowStaticColorPicker.style.display = 'block';
        elements.mainWindowGradientPickers.style.display = 'none';
    } else {
        // Load gradient colors
        elements.colorNormalStart.value = prefs.normal.start;
        elements.colorNormalEnd.value = prefs.normal.end;
        elements.colorWarningStart.value = prefs.warning.start;
        elements.colorWarningEnd.value = prefs.warning.end;
        elements.colorDangerStart.value = prefs.danger.start;
        elements.colorDangerEnd.value = prefs.danger.end;
        elements.mainWindowStaticColorPicker.style.display = 'none';
        elements.mainWindowGradientPickers.style.display = 'grid';
    }
}

async function saveCurrentColors() {
    const isStatic = elements.mainWindowStaticColor.checked;

    let prefs;
    if (isStatic) {
        // Use static color for all states
        const staticColor = elements.mainWindowStaticColorValue.value;
        prefs = {
            isStatic: true,
            staticColor: staticColor,
            normal: { start: staticColor, end: staticColor },
            warning: { start: staticColor, end: staticColor },
            danger: { start: staticColor, end: staticColor }
        };
    } else {
        // Use gradient colors
        prefs = {
            isStatic: false,
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
    }

    await window.electronAPI.setColorPreferences(prefs);
    // Notify main window to update colors
    await window.electronAPI.notifyColorChange(prefs);
}

// Tray settings functions
function loadTraySettings(settings) {
    // Set display mode
    if (settings.displayMode === 'weekly') {
        elements.trayDisplayWeekly.checked = true;
    } else {
        elements.trayDisplaySession.checked = true;
    }

    // Set show text toggle
    const showText = settings.showText !== undefined ? settings.showText : false;
    elements.trayShowText.checked = showText;
    elements.trayShowTextLabel.textContent = showText ? 'Enabled' : 'Disabled';

    // Check if static mode
    const isStatic = settings.isStatic || false;
    elements.trayStaticColor.checked = isStatic;

    if (isStatic) {
        // Load static color
        elements.trayStaticColorValue.value = settings.staticColor || '#8b5cf6';
        elements.trayStaticColorPicker.style.display = 'block';
        elements.trayGradientPickers.style.display = 'none';
    } else {
        // Load gradient colors
        elements.trayColorNormalStart.value = settings.colors.normal.start;
        elements.trayColorNormalEnd.value = settings.colors.normal.end;
        elements.trayColorWarningStart.value = settings.colors.warning.start;
        elements.trayColorWarningEnd.value = settings.colors.warning.end;
        elements.trayColorDangerStart.value = settings.colors.danger.start;
        elements.trayColorDangerEnd.value = settings.colors.danger.end;
        elements.trayStaticColorPicker.style.display = 'none';
        elements.trayGradientPickers.style.display = 'grid';
    }
}

function loadTrayUpdateInterval(interval) {
    elements.trayUpdateInterval.value = interval;
    elements.trayUpdateValue.textContent = interval;
}

async function saveTraySettings() {
    const isStatic = elements.trayStaticColor.checked;

    let settings;
    if (isStatic) {
        // Use static color for all states
        const staticColor = elements.trayStaticColorValue.value;
        settings = {
            displayMode: elements.trayDisplayWeekly.checked ? 'weekly' : 'session',
            showText: elements.trayShowText.checked,
            isStatic: true,
            staticColor: staticColor,
            colors: {
                normal: { start: staticColor, end: staticColor },
                warning: { start: staticColor, end: staticColor },
                danger: { start: staticColor, end: staticColor }
            }
        };
    } else {
        // Use gradient colors
        settings = {
            displayMode: elements.trayDisplayWeekly.checked ? 'weekly' : 'session',
            showText: elements.trayShowText.checked,
            isStatic: false,
            colors: {
                normal: {
                    start: elements.trayColorNormalStart.value,
                    end: elements.trayColorNormalEnd.value
                },
                warning: {
                    start: elements.trayColorWarningStart.value,
                    end: elements.trayColorWarningEnd.value
                },
                danger: {
                    start: elements.trayColorDangerStart.value,
                    end: elements.trayColorDangerEnd.value
                }
            }
        };
    }

    await window.electronAPI.setTraySettings(settings);
}

// Theme settings functions
async function loadThemeSettings() {
    const theme = await window.electronAPI.getThemeSettings();

    elements.backgroundColorStart.value = theme.backgroundStart || '#1e1e2e';
    elements.backgroundColorEnd.value = theme.backgroundEnd || '#2a2a3e';
    elements.textColorPrimary.value = theme.textPrimary || '#e0e0e0';
    elements.textColorSecondary.value = theme.textSecondary || '#a0a0a0';
    elements.titleBarBackground.value = theme.titleBarBg || '#000000';
    elements.titleBarOpacity.value = theme.titleBarOpacity || 30;
    elements.titleBarOpacityValue.textContent = elements.titleBarOpacity.value;
    elements.borderColor.value = theme.borderColor || '#ffffff';
    elements.borderOpacity.value = theme.borderOpacity || 10;
    elements.borderOpacityValue.textContent = elements.borderOpacity.value;
}

async function saveThemeSettings() {
    const theme = {
        backgroundStart: elements.backgroundColorStart.value,
        backgroundEnd: elements.backgroundColorEnd.value,
        textPrimary: elements.textColorPrimary.value,
        textSecondary: elements.textColorSecondary.value,
        titleBarBg: elements.titleBarBackground.value,
        titleBarOpacity: parseInt(elements.titleBarOpacity.value),
        borderColor: elements.borderColor.value,
        borderOpacity: parseInt(elements.borderOpacity.value)
    };

    await window.electronAPI.setThemeSettings(theme);

    // Apply theme to settings window immediately
    applyThemeToSettings(theme);

    // Notify main window to update
    await window.electronAPI.notifyThemeChange(theme);
}

async function resetTheme() {
    const defaults = {
        backgroundStart: '#1e1e2e',
        backgroundEnd: '#2a2a3e',
        textPrimary: '#e0e0e0',
        textSecondary: '#a0a0a0',
        titleBarBg: '#000000',
        titleBarOpacity: 30,
        borderColor: '#ffffff',
        borderOpacity: 10
    };

    await window.electronAPI.setThemeSettings(defaults);
    await loadThemeSettings();

    // Apply theme to settings window immediately
    applyThemeToSettings(defaults);

    // Notify main window to update
    await window.electronAPI.notifyThemeChange(defaults);
}

// Apply theme to settings window
function applyThemeToSettings(theme) {
    const settingsApp = document.getElementById('settings-app');
    const titleBar = document.querySelector('.title-bar');

    // Apply background gradient
    if (settingsApp) {
        settingsApp.style.background = `linear-gradient(135deg, ${theme.backgroundStart} 0%, ${theme.backgroundEnd} 100%)`;
    }

    // Apply title bar background
    if (titleBar) {
        const opacity = theme.titleBarOpacity / 100;
        const bgColor = theme.titleBarBg;
        titleBar.style.background = `rgba(${parseInt(bgColor.slice(1, 3), 16)}, ${parseInt(bgColor.slice(3, 5), 16)}, ${parseInt(bgColor.slice(5, 7), 16)}, ${opacity})`;
    }

    // Apply text colors via CSS variables
    const root = document.documentElement;
    root.style.setProperty('--text-primary', theme.textPrimary);
    root.style.setProperty('--text-secondary', theme.textSecondary);

    // Update primary text color (titles, labels)
    const primaryTextElements = document.querySelectorAll('.title span, h2, h3, .radio-label, .toggle-label, .setting-description');
    primaryTextElements.forEach(el => {
        if (el.classList.contains('setting-description')) {
            // Secondary text for descriptions
            el.style.color = theme.textSecondary;
        } else {
            // Primary text for titles/labels
            el.style.color = theme.textPrimary;
        }
    });
}

// Setup collapsible sections
function setupCollapsibleSections() {
    const collapsibleHeaders = document.querySelectorAll('.collapsible-header');

    collapsibleHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const content = header.nextElementSibling;
            const isActive = header.classList.contains('active');

            // Toggle active state
            header.classList.toggle('active');
            content.classList.toggle('active');
        });
    });
}

// Start the application
init();
