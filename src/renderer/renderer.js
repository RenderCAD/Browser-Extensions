const RENDERCAD_BASE_URL = "https://rendercad.ai";

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

        const token = await window.electronAPI.getStoredToken();
        
        if (token) {
            const isValid = await window.electronAPI.validateToken(token);
            if (isValid) {
                const userInfo = await window.electronAPI.getUserInfo();
                loading.style.display = 'none';
                accountInfo.classList.add('visible');

                emailText.textContent = userInfo?.email || 'User';
                const plan = (userInfo?.plan || 'free').toUpperCase();
                planBadge.textContent = plan;

                const used = userInfo?.monthly_renders_used || 0;
                const limit = userInfo?.monthly_render_limit || 0;

                if (limit > 0) {
                    tokenSection.style.display = 'block';
                    tokenText.textContent = `${used} / ${limit} tokens`;

                    const percentage = limit > 0 ? (used / limit) * 100 : 0;
                    tokenFill.style.width = `${Math.min(percentage, 100)}%`;

                    if (percentage >= 90) {
                        tokenFill.style.background = 'linear-gradient(90deg, #f44336, #ff5722)';
                    } else if (percentage >= 70) {
                        tokenFill.style.background = 'linear-gradient(90deg, #ff9800, #ffc107)';
                    } else {
                        tokenFill.style.background = 'linear-gradient(90deg, #4CAF50, #8BC34A)';
                    }
                } else {
                    tokenSection.style.display = 'none';
                }
            } else {
                await window.electronAPI.clearToken();
                loading.style.display = 'none';
                notLoggedIn.classList.add('visible');
            }
        } else {
            loading.style.display = 'none';
            notLoggedIn.classList.add('visible');
        }
    }

    // Capture button click
    captureBtn.addEventListener('click', async function() {
        // Ensure we have a valid token
        let token = await window.electronAPI.getStoredToken();
        if (!token) {
            token = await authenticateUser();
        } else {
            const isValid = await window.electronAPI.validateToken(token);
            if (!isValid) {
                token = await authenticateUser();
            }
        }

        if (token) {
            // Start capture via IPC
            window.electronAPI.startCapture();
        }
    });

    // Render Studio button click
    renderStudioBtn.addEventListener('click', function() {
        window.electronAPI.openExternal('https://rendercad.ai/render');
    });

    // View History button click
    viewHistoryBtn.addEventListener('click', function() {
        window.electronAPI.openExternal('https://rendercad.ai/history');
    });

    // Send Feedback button click
    feedbackBtn.addEventListener('click', function() {
        window.electronAPI.openExternal('https://rendercad.ai/settings');
    });

    // Logout button click
    logoutBtn.addEventListener('click', async function() {
        await window.electronAPI.clearToken();
        loadUserInfo();
    });

    // Login button click
    loginBtn.addEventListener('click', async function() {
        try {
            loginBtn.disabled = true;
            loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Starting...';
            await authenticateUser();
            setTimeout(loadUserInfo, 2000);
        } catch (error) {
            loginBtn.disabled = false;
            loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
            console.error('Login failed:', error);
        }
    });

    // Device code authentication flow
    async function authenticateUser() {
        try {
            // Request device code
            loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Requesting code...';
            const deviceCodeData = await window.electronAPI.requestDeviceCode();
            
            if (!deviceCodeData || !deviceCodeData.verification_url) {
                throw new Error('Invalid response from server');
            }
            
            // Open browser for user authentication
            loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Opening browser...';
            try {
                await window.electronAPI.openExternal(deviceCodeData.verification_url);
                console.log('Browser opened to:', deviceCodeData.verification_url);
            } catch (openError) {
                console.error('Failed to open browser:', openError);
                // Show the URL to the user so they can open it manually
                alert(`Please open this URL in your browser:\n\n${deviceCodeData.verification_url}\n\nCode: ${deviceCodeData.code}`);
            }

            // Don't show notification during auth - the browser opening is enough

            // Poll for token
            loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Waiting for authentication...';
            const expiresAt = Date.now() + (deviceCodeData.expires_in * 1000);
            const pollInterval = deviceCodeData.poll_interval * 1000;

            const token = await pollForToken(deviceCodeData.code, pollInterval, expiresAt);

            // Store the token
            await window.electronAPI.storeToken(token);
            
            loginBtn.innerHTML = '<i class="fas fa-check"></i> Success!';
            // Don't show notification - the UI update is enough

            return token;
        } catch (error) {
            console.error('Authentication failed:', error);
            loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
            await window.electronAPI.showNotification({
                title: 'Authentication Failed',
                body: error.message || 'Please try again'
            });
            throw error;
        }
    }

    async function pollForToken(code, pollInterval, expiresAt) {
        return new Promise((resolve, reject) => {
            const poll = async () => {
                if (Date.now() > expiresAt) {
                    reject(new Error('Device code expired'));
                    return;
                }

                try {
                    const data = await window.electronAPI.pollDeviceCode(code);

                    if (data.status === 'pending') {
                        setTimeout(poll, pollInterval);
                    } else if (data.status === 'authorized') {
                        resolve(data.api_token);
                    } else {
                        reject(new Error(data.message || 'Authentication failed'));
                    }
                } catch (error) {
                    setTimeout(poll, pollInterval);
                }
            };
            poll();
        });
    }

    // Initial load
    loadUserInfo();
});

