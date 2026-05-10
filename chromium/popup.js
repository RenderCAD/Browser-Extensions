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
            // Check for extension context invalidation (happens when extension reloads)
            if (chrome.runtime.lastError) {
                console.error('Extension error:', chrome.runtime.lastError);
                loading.style.display = 'none';
                notLoggedIn.classList.add('visible');
                emailText.textContent = 'Extension updated - please close and reopen popup';
                return;
            }
            
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
        // Disable button to prevent double-clicks
        captureBtn.disabled = true;
        captureBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Starting...';
        
        try {
            // Get active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                throw new Error('No active tab found');
            }

            // Send message and wait for response with timeout
            const response = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Timeout waiting for response'));
                }, 5000); // 5 second timeout
                
                chrome.runtime.sendMessage({
                    action: 'startCapture',
                    tabId: tab.id
                }, (result) => {
                    clearTimeout(timeout);
                    
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(result);
                    }
                });
            });
            
            if (response && response.success) {
                // Success - close popup
                window.close();
            } else {
                // Failed
                throw new Error(response?.error || 'Unknown error');
            }
        } catch (error) {
            console.error('Capture error:', error);
            captureBtn.disabled = false;
            captureBtn.innerHTML = '<i class="fas fa-camera"></i> Capture & Render';
            alert('Failed to start capture: ' + error.message);
        }
    });

    // Render Studio button click
    renderStudioBtn.addEventListener('click', async function() {
        try {
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Timeout')), 2000);
                chrome.runtime.sendMessage({ action: 'openStudio' }, () => {
                    clearTimeout(timeout);
                    resolve();
                });
            });
        } catch (e) {
            console.error('openStudio error:', e);
        }
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
    logoutBtn.addEventListener('click', async function() {
        try {
            await new Promise((resolve) => {
                chrome.runtime.sendMessage({ action: 'logout' }, () => {
                    // Ignore errors, just reload info
                    resolve();
                });
            });
        } catch (e) {
            console.error('Logout error:', e);
        }
        loadUserInfo();
    });

    // Login button click
    loginBtn.addEventListener('click', function() {
        // Show loading state
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Opening browser...';
        
        chrome.runtime.sendMessage({ action: 'login' }, function(response) {
            if (chrome.runtime.lastError) {
                console.error('Login error:', chrome.runtime.lastError);
                loginBtn.disabled = false;
                loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
                alert('Login failed: ' + chrome.runtime.lastError.message);
                return;
            }
            
            if (response && response.success) {
                // Auth flow started successfully - browser tab opened
                // Poll for auth completion since user needs to authenticate in browser
                let attempts = 0;
                const maxAttempts = 60; // Poll for up to 2 minutes
                const pollInterval = 2000; // Check every 2 seconds
                
                const pollForAuth = setInterval(() => {
                    attempts++;
                    loadUserInfo();
                    
                    // Check if logged in now
                    chrome.runtime.sendMessage({ action: 'getUserInfo' }, function(userResponse) {
                        if (userResponse && userResponse.loggedIn) {
                            clearInterval(pollForAuth);
                        } else if (attempts >= maxAttempts) {
                            clearInterval(pollForAuth);
                            loginBtn.disabled = false;
                            loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
                            console.log('Auth polling timed out - user may still be authenticating');
                        }
                    });
                }, pollInterval);
            } else {
                // Auth failed to start
                loginBtn.disabled = false;
                loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
                alert('Login failed: ' + (response?.error || 'Unknown error'));
            }
        });
    });

    // Initial load
    loadUserInfo();
});
