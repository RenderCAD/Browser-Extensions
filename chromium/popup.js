document.addEventListener('DOMContentLoaded', async function() {
    const loading = document.getElementById('loading');
    const accountInfo = document.getElementById('accountInfo');
    const notLoggedIn = document.getElementById('notLoggedIn');
    const emailText = document.getElementById('emailText');
    const planBadge = document.getElementById('planBadge');
    const tokenSection = document.getElementById('tokenSection');
    const tokenText = document.getElementById('tokenText');
    const tokenFill = document.getElementById('tokenFill');
    const captureBtn = document.getElementById('captureBtn');
    const renderStudioBtn = document.getElementById('renderStudioBtn');
    const viewHistoryBtn = document.getElementById('viewHistoryBtn');
    const feedbackBtn = document.getElementById('feedbackBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const loginBtn = document.getElementById('loginBtn');

    // Load user info and display appropriate UI
    async function loadUserInfo() {
        loading.style.display = 'block';
        accountInfo.classList.remove('visible');
        notLoggedIn.classList.remove('visible');

        // Request user info from background script
        chrome.runtime.sendMessage({ action: 'getUserInfo' }, function(response) {
            loading.style.display = 'none';

            if (response && response.loggedIn) {
                // Show account info
                accountInfo.classList.add('visible');

                // Display email
                emailText.textContent = response.userInfo.email || 'User';

                // Display plan
                const plan = (response.userInfo.plan || 'free').toUpperCase();
                planBadge.textContent = plan;

                // Display token usage if available
                const used = response.userInfo.monthly_renders_used || 0;
                const limit = response.userInfo.monthly_render_limit || 0;

                if (limit > 0) {
                    tokenSection.style.display = 'block';
                    tokenText.textContent = `${used} / ${limit} tokens`;

                    // Calculate percentage for progress bar
                    const percentage = limit > 0 ? (used / limit) * 100 : 0;
                    tokenFill.style.width = `${Math.min(percentage, 100)}%`;

                    // Change color based on usage
                    if (percentage >= 90) {
                        tokenFill.style.background = 'linear-gradient(90deg, #f44336, #ff5722)';
                    } else if (percentage >= 70) {
                        tokenFill.style.background = 'linear-gradient(90deg, #ff9800, #ffc107)';
                    } else {
                        tokenFill.style.background = 'linear-gradient(90deg, #4CAF50, #8BC34A)';
                    }
                }
            } else {
                // Show login prompt
                notLoggedIn.classList.add('visible');
            }
        });
    }

    // Capture button click
    captureBtn.addEventListener('click', async function() {
        // Close popup and trigger capture on the active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        chrome.runtime.sendMessage({
            action: 'startCapture',
            tabId: tab.id
        });

        window.close();
    });

    // Render Studio button click
    renderStudioBtn.addEventListener('click', function() {
        chrome.tabs.create({ url: 'https://rendercad.ai/render' });
        window.close();
    });

    // View History button click
    viewHistoryBtn.addEventListener('click', function() {
        chrome.tabs.create({ url: 'https://rendercad.ai/history' });
        window.close();
    });

    // Send Feedback button click
    feedbackBtn.addEventListener('click', function() {
        chrome.tabs.create({ url: 'https://rendercad.ai/settings' });
        window.close();
    });

    // Logout button click
    logoutBtn.addEventListener('click', function() {
        chrome.runtime.sendMessage({ action: 'logout' }, function() {
            loadUserInfo();
        });
    });

    // Login button click
    loginBtn.addEventListener('click', function() {
        chrome.runtime.sendMessage({ action: 'login' }, function() {
            // Popup will reload when auth completes
            setTimeout(loadUserInfo, 2000);
        });
    });

    // Initial load
    loadUserInfo();
});
