// Application state
let credentials = null;
let updateInterval = null;
let countdownInterval = null;
let latestUsageData = null;
let usageChart = null;
let graphVisible = false;
let lastRefreshTime = null;
let refreshedAgoInterval = null;
let appConfig = null;

// DOM elements
const elements = {
    loadingContainer: document.getElementById('loadingContainer'),
    loginContainer: document.getElementById('loginContainer'),
    noUsageContainer: document.getElementById('noUsageContainer'),
    autoLoginContainer: document.getElementById('autoLoginContainer'),
    mainContent: document.getElementById('mainContent'),
    loginBtn: document.getElementById('loginBtn'),
    refreshBtn: document.getElementById('refreshBtn'),
    minimizeBtn: document.getElementById('minimizeBtn'),
    closeBtn: document.getElementById('closeBtn'),

    sessionPercentage: document.getElementById('sessionPercentage'),
    sessionProgress: document.getElementById('sessionProgress'),
    sessionTimer: document.getElementById('sessionTimer'),
    sessionTimeText: document.getElementById('sessionTimeText'),

    weeklyPercentage: document.getElementById('weeklyPercentage'),
    weeklyProgress: document.getElementById('weeklyProgress'),
    weeklyTimer: document.getElementById('weeklyTimer'),
    weeklyTimeText: document.getElementById('weeklyTimeText'),

    sonnetPercentage: document.getElementById('sonnetPercentage'),
    sonnetProgress: document.getElementById('sonnetProgress'),
    sonnetTimer: document.getElementById('sonnetTimer'),
    sonnetTimeText: document.getElementById('sonnetTimeText'),

    settingsBtn: document.getElementById('settingsBtn'),
    settingsOverlay: document.getElementById('settingsOverlay'),
    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    coffeeBtn: document.getElementById('coffeeBtn'),

    graphBtn: document.getElementById('graphBtn'),
    graphSection: document.getElementById('graphSection'),
    usageChart: document.getElementById('usageChart'),

    statusBar: document.getElementById('statusBar'),
    refreshedAgo: document.getElementById('refreshedAgo'),

    sonnetSection: document.getElementById('sonnetSection')
};

// Initialize
async function init() {
    setupEventListeners();
    appConfig = await window.electronAPI.getConfig();
    credentials = await window.electronAPI.getCredentials();

    // Hide sonnet section if configured
    if (!appConfig.showWeeklySonnet) {
        elements.sonnetSection.style.display = 'none';
    }

    if (credentials.sessionKey && credentials.organizationId) {
        showMainContent();
        await fetchUsageData();
        startAutoUpdate();
    } else {
        showLoginRequired();
    }
}

// Event Listeners
function setupEventListeners() {
    elements.loginBtn.addEventListener('click', () => {
        window.electronAPI.openLogin();
    });

    elements.refreshBtn.addEventListener('click', async () => {
        console.log('Refresh button clicked');
        elements.refreshBtn.classList.add('spinning');
        await fetchUsageData();
        elements.refreshBtn.classList.remove('spinning');
    });

    elements.minimizeBtn.addEventListener('click', () => {
        window.electronAPI.minimizeWindow();
    });

    elements.closeBtn.addEventListener('click', () => {
        window.electronAPI.closeWindow(); // Exit application completely
    });

    // Settings calls
    elements.settingsBtn.addEventListener('click', () => {
        elements.settingsOverlay.style.display = 'flex';
    });

    elements.closeSettingsBtn.addEventListener('click', () => {
        elements.settingsOverlay.style.display = 'none';
    });

    elements.logoutBtn.addEventListener('click', async () => {
        await window.electronAPI.deleteCredentials();
        elements.settingsOverlay.style.display = 'none';
        showLoginRequired();
        window.electronAPI.openLogin();
    });

    elements.coffeeBtn.addEventListener('click', () => {
        window.electronAPI.openExternal('https://paypal.me/SlavomirDurej?country.x=GB&locale.x=en_GB');
    });

    elements.graphBtn.addEventListener('click', toggleGraph);

    // Listen for login success
    window.electronAPI.onLoginSuccess(async (data) => {
        console.log('Renderer received login-success event');
        credentials = data;
        await window.electronAPI.saveCredentials(data);
        console.log('Credentials saved, showing main content');
        showMainContent();
        await fetchUsageData();
        startAutoUpdate();
    });

    // Listen for refresh requests from tray
    window.electronAPI.onRefreshUsage(async () => {
        await fetchUsageData();
    });

    // Listen for session expiration events (403 errors) - only used as fallback
    window.electronAPI.onSessionExpired(() => {
        console.log('Session expired event received');
        credentials = { sessionKey: null, organizationId: null };
        showLoginRequired();
    });

    // Listen for silent login attempts
    window.electronAPI.onSilentLoginStarted(() => {
        console.log('Silent login started...');
        showAutoLoginAttempt();
    });

    // Listen for silent login failures (falls back to visible login)
    window.electronAPI.onSilentLoginFailed(() => {
        console.log('Silent login failed, manual login required');
        showLoginRequired();
    });
}

// Fetch usage data from Claude API
async function fetchUsageData() {
    console.log('fetchUsageData called');

    if (!credentials.sessionKey || !credentials.organizationId) {
        console.log('Missing credentials, showing login');
        showLoginRequired();
        return;
    }

    try {
        console.log('Calling electronAPI.fetchUsageData...');
        const data = await window.electronAPI.fetchUsageData();
        console.log('Received usage data:', data);
        updateUI(data);
    } catch (error) {
        console.error('Error fetching usage data:', error);
        if (error.message.includes('SessionExpired') || error.message.includes('Unauthorized')) {
            // Session expired - silent login attempt is in progress
            // Show auto-login UI while waiting
            credentials = { sessionKey: null, organizationId: null };
            showAutoLoginAttempt();
        } else {
            showError('Failed to fetch usage data');
        }
    }
}

// Check if there's no usage data
function hasNoUsage(data) {
    const sessionUtilization = data.five_hour?.utilization || 0;
    const sessionResetsAt = data.five_hour?.resets_at;
    const weeklyUtilization = data.seven_day?.utilization || 0;
    const weeklyResetsAt = data.seven_day?.resets_at;

    const sonnetUtilization = data.seven_day_sonnet?.utilization || 0;
    const sonnetResetsAt = data.seven_day_sonnet?.resets_at;

    return sessionUtilization === 0 && !sessionResetsAt &&
        weeklyUtilization === 0 && !weeklyResetsAt &&
        sonnetUtilization === 0 && !sonnetResetsAt;
}

// Update UI with usage data
function updateUI(data) {
    latestUsageData = data;

    // Check if there's no usage data
    if (hasNoUsage(data)) {
        showNoUsage();
        return;
    }

    showMainContent();
    refreshTimers();
    startCountdown();

    // Update refresh time
    lastRefreshTime = Date.now();
    updateRefreshedAgo();
    startRefreshedAgoTimer();

    // Auto-refresh chart if visible
    if (graphVisible) {
        loadChart();
    }
}

// Track if we've already triggered a refresh for expired timers
let sessionResetTriggered = false;
let weeklyResetTriggered = false;

function refreshTimers() {
    if (!latestUsageData) return;

    // Session data
    const sessionUtilization = latestUsageData.five_hour?.utilization || 0;
    const sessionResetsAt = latestUsageData.five_hour?.resets_at;

    // Check if session timer has expired and we need to refresh
    if (sessionResetsAt) {
        const sessionDiff = new Date(sessionResetsAt) - new Date();
        if (sessionDiff <= 0 && !sessionResetTriggered) {
            sessionResetTriggered = true;
            console.log('Session timer expired, triggering refresh...');
            // Wait a few seconds for the server to update, then refresh
            setTimeout(() => {
                fetchUsageData();
            }, 3000);
        } else if (sessionDiff > 0) {
            sessionResetTriggered = false; // Reset flag when timer is active again
        }
    }

    updateProgressBar(
        elements.sessionProgress,
        elements.sessionPercentage,
        sessionUtilization
    );

    updateTimer(
        elements.sessionTimer,
        elements.sessionTimeText,
        sessionResetsAt,
        5 * 60 // 5 hours in minutes
    );

    // Weekly data
    const weeklyUtilization = latestUsageData.seven_day?.utilization || 0;
    const weeklyResetsAt = latestUsageData.seven_day?.resets_at;

    // Check if weekly timer has expired and we need to refresh
    if (weeklyResetsAt) {
        const weeklyDiff = new Date(weeklyResetsAt) - new Date();
        if (weeklyDiff <= 0 && !weeklyResetTriggered) {
            weeklyResetTriggered = true;
            console.log('Weekly timer expired, triggering refresh...');
            setTimeout(() => {
                fetchUsageData();
            }, 3000);
        } else if (weeklyDiff > 0) {
            weeklyResetTriggered = false;
        }
    }

    updateProgressBar(
        elements.weeklyProgress,
        elements.weeklyPercentage,
        weeklyUtilization,
        true
    );

    updateTimer(
        elements.weeklyTimer,
        elements.weeklyTimeText,
        weeklyResetsAt,
        7 * 24 * 60 // 7 days in minutes
    );

    // Sonnet data
    const sonnetUtilization = latestUsageData.seven_day_sonnet?.utilization || 0;
    const sonnetResetsAt = latestUsageData.seven_day_sonnet?.resets_at;

    updateProgressBar(
        elements.sonnetProgress,
        elements.sonnetPercentage,
        sonnetUtilization
    );

    updateTimer(
        elements.sonnetTimer,
        elements.sonnetTimeText,
        sonnetResetsAt,
        7 * 24 * 60 // 7 days in minutes
    );
}

function startCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
        refreshTimers();
    }, 1000);
}

// Update progress bar
function updateProgressBar(progressElement, percentageElement, value, isWeekly = false) {
    const percentage = Math.min(Math.max(value, 0), 100);

    progressElement.style.width = `${percentage}%`;
    percentageElement.textContent = `${Math.round(percentage)}%`;

    // Update color based on usage level
    progressElement.classList.remove('warning', 'danger');
    if (percentage >= 90) {
        progressElement.classList.add('danger');
    } else if (percentage >= 75) {
        progressElement.classList.add('warning');
    }
}

// Update circular timer
function updateTimer(timerElement, textElement, resetsAt, totalMinutes) {
    if (!resetsAt) {
        textElement.textContent = '--:--';
        textElement.style.opacity = '0.5';
        textElement.title = 'Starts when a message is sent';
        timerElement.style.strokeDashoffset = 63;
        return;
    }

    // Clear the greyed out styling and tooltip when timer is active
    textElement.style.opacity = '1';
    textElement.title = '';

    const resetDate = new Date(resetsAt);
    const now = new Date();
    const diff = resetDate - now;

    if (diff <= 0) {
        textElement.textContent = 'Resetting...';
        timerElement.style.strokeDashoffset = 0;
        return;
    }

    // Calculate remaining time
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    // const seconds = Math.floor((diff % (1000 * 60)) / 1000); // Optional seconds

    // Format time display
    if (hours >= 24) {
        const days = Math.floor(hours / 24);
        const remainingHours = hours % 24;
        textElement.textContent = `${days}d ${remainingHours}h`;
    } else if (hours > 0) {
        textElement.textContent = `${hours}h ${minutes}m`;
    } else {
        textElement.textContent = `${minutes}m`;
    }

    // Calculate progress (elapsed percentage)
    const totalMs = totalMinutes * 60 * 1000;
    const elapsedMs = totalMs - diff;
    const elapsedPercentage = (elapsedMs / totalMs) * 100;

    // Update circle (63 is ~2*pi*10)
    const circumference = 63;
    const offset = circumference - (elapsedPercentage / 100) * circumference;
    timerElement.style.strokeDashoffset = offset;

    // Update color based on remaining time
    timerElement.classList.remove('warning', 'danger');
    if (elapsedPercentage >= 90) {
        timerElement.classList.add('danger');
    } else if (elapsedPercentage >= 75) {
        timerElement.classList.add('warning');
    }
}

// UI State Management
function showLoading() {
    elements.loadingContainer.style.display = 'block';
    elements.loginContainer.style.display = 'none';
    elements.noUsageContainer.style.display = 'none';
    elements.autoLoginContainer.style.display = 'none';
    elements.mainContent.style.display = 'none';
}

function showLoginRequired() {
    elements.loadingContainer.style.display = 'none';
    elements.loginContainer.style.display = 'flex'; // Use flex to preserve centering
    elements.noUsageContainer.style.display = 'none';
    elements.autoLoginContainer.style.display = 'none';
    elements.mainContent.style.display = 'none';
    elements.statusBar.style.display = 'none';
    stopAutoUpdate();
}

function showNoUsage() {
    elements.loadingContainer.style.display = 'none';
    elements.loginContainer.style.display = 'none';
    elements.noUsageContainer.style.display = 'flex';
    elements.autoLoginContainer.style.display = 'none';
    elements.mainContent.style.display = 'none';
}

function showAutoLoginAttempt() {
    elements.loadingContainer.style.display = 'none';
    elements.loginContainer.style.display = 'none';
    elements.noUsageContainer.style.display = 'none';
    elements.autoLoginContainer.style.display = 'flex';
    elements.mainContent.style.display = 'none';
    stopAutoUpdate();
}

function showMainContent() {
    elements.loadingContainer.style.display = 'none';
    elements.loginContainer.style.display = 'none';
    elements.noUsageContainer.style.display = 'none';
    elements.autoLoginContainer.style.display = 'none';
    elements.mainContent.style.display = 'block';
    elements.statusBar.style.display = 'block';
    if (!lastRefreshTime) {
        elements.refreshedAgo.textContent = 'Refreshed just now';
    }
}

function showError(message) {
    // TODO: Implement error notification
    console.error(message);
}

// Auto-update management
function startAutoUpdate() {
    stopAutoUpdate();
    const intervalMs = (appConfig?.refreshIntervalMinutes || 5) * 60 * 1000;
    updateInterval = setInterval(() => {
        fetchUsageData();
    }, intervalMs);
}

function stopAutoUpdate() {
    if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
    }
}

// Add spinning animation for refresh button
const style = document.createElement('style');
style.textContent = `
    @keyframes spin-refresh {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
    
    .refresh-btn.spinning svg {
        animation: spin-refresh 1s linear;
    }
`;
document.head.appendChild(style);

// Start the application
init();

// Cleanup on unload
// Refresh time tracking
function updateRefreshedAgo() {
    if (!lastRefreshTime) return;
    
    const now = Date.now();
    const diff = now - lastRefreshTime;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    
    let text;
    if (seconds < 60) {
        text = 'Refreshed just now';
    } else if (minutes === 1) {
        text = 'Refreshed 1 minute ago';
    } else {
        text = `Refreshed ${minutes} minutes ago`;
    }
    
    elements.refreshedAgo.textContent = text;
}

function startRefreshedAgoTimer() {
    if (refreshedAgoInterval) clearInterval(refreshedAgoInterval);
    refreshedAgoInterval = setInterval(updateRefreshedAgo, 30000); // Update every 30 seconds
}

// Graph functions
function toggleGraph() {
    graphVisible = !graphVisible;
    elements.graphSection.style.display = graphVisible ? 'block' : 'none';
    elements.graphBtn.classList.toggle('active', graphVisible);
    window.electronAPI.toggleGraph(graphVisible);

    if (graphVisible) {
        loadChart();
    }
}

async function loadChart() {
    const history = await window.electronAPI.getUsageHistory();

    if (history.length === 0) return;

    const labels = history.map(h => {
        const date = new Date(h.timestamp);
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    });

    renderChart(labels, history);
}

function renderChart(labels, history) {
    if (usageChart) usageChart.destroy();

    // Calculate dynamic y-axis max (round up to nearest 10)
    const allValues = appConfig.showWeeklySonnet
        ? history.flatMap(h => [h.session, h.weekly, h.sonnet])
        : history.flatMap(h => [h.session, h.weekly]);
    const maxValue = Math.max(...allValues);
    const yMax = Math.ceil(maxValue / 10) * 10 || 10; // Minimum 10%

    const datasets = [
        {
            data: history.map(h => h.session),
            borderColor: '#8b5cf6',  // Purple - matches session bar
            backgroundColor: 'transparent',
            borderWidth: 2,
            tension: 0.1,
            pointRadius: 1
        },
        {
            data: history.map(h => h.weekly),
            borderColor: '#3b82f6',  // Blue - matches weekly bar
            backgroundColor: 'transparent',
            borderWidth: 2,
            tension: 0.4,
            pointRadius: 1
        }
    ];

    // Only add sonnet dataset if configured to show
    if (appConfig.showWeeklySonnet) {
        datasets.push({
            data: history.map(h => h.sonnet),
            borderColor: '#10b981',  // Green - matches sonnet bar
            backgroundColor: 'transparent',
            borderWidth: 2,
            tension: 0.4,
            pointRadius: 1
        });
    }

    const ctx = elements.usageChart.getContext('2d');
    usageChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { min: 0, max: yMax, ticks: { callback: v => v + '%' } },
                x: { display: false }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

window.addEventListener('beforeunload', () => {
    stopAutoUpdate();
    if (countdownInterval) clearInterval(countdownInterval);
});
