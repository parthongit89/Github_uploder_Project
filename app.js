// State variables
let isAuthenticated = false;
let selectedRepo = null;
let localFiles = [];
let syncInterval = null;

// DOM Elements
const tokenModal = document.getElementById('token-modal');
const tokenInput = document.getElementById('token-input');
const btnSaveToken = document.getElementById('btn-save-token');
const tokenError = document.getElementById('token-error');

const userProfile = document.getElementById('user-profile');
const userAvatar = document.getElementById('user-avatar');
const userUsername = document.getElementById('user-username');
const btnLogout = document.getElementById('btn-logout');

const newRepoName = document.getElementById('new-repo-name');
const btnCreateRepo = document.getElementById('btn-create-repo');
const repoGrid = document.getElementById('repo-grid');

const filesList = document.getElementById('files-list');
const syncStatus = document.getElementById('sync-status');
const btnUpload = document.getElementById('btn-upload');

const consoleCard = document.getElementById('console-card');
const consoleLog = document.getElementById('console-log');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    checkAuthentication();
    setupEventListeners();
});

// Event Listeners
function setupEventListeners() {
    btnSaveToken.addEventListener('click', saveToken);
    tokenInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveToken();
    });
    
    btnLogout.addEventListener('click', logout);
    
    btnCreateRepo.addEventListener('click', createRepository);
    newRepoName.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') createRepository();
    });
    
    btnUpload.addEventListener('click', uploadFiles);
}

// Authentication Checks
async function checkAuthentication() {
    try {
        const response = await fetch('/api/config');
        const data = await response.json();
        
        if (data.configured) {
            isAuthenticated = true;
            tokenModal.classList.add('hidden');
            showUserProfile(data.username, data.avatar_url);
            
            // Load dashboard data
            loadRepositories();
            loadLocalFiles();
            
            // Start polling local directory every 3 seconds for real-time syncing
            if (syncInterval) clearInterval(syncInterval);
            syncInterval = setInterval(loadLocalFiles, 3000);
        } else {
            isAuthenticated = false;
            tokenModal.classList.remove('hidden');
            if (syncInterval) clearInterval(syncInterval);
        }
    } catch (err) {
        console.error('Error checking authentication:', err);
    }
}

function showUserProfile(username, avatarUrl) {
    userProfile.classList.remove('hidden');
    userUsername.textContent = username;
    userAvatar.src = avatarUrl || 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png';
}

async function saveToken() {
    const token = tokenInput.value.trim();
    if (!token) {
        showTokenError('Token is required.');
        return;
    }
    
    btnSaveToken.disabled = true;
    btnSaveToken.textContent = 'Authenticating...';
    tokenError.classList.add('hidden');
    
    try {
        const response = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });
        const data = await response.json();
        
        if (data.success) {
            checkAuthentication();
        } else {
            showTokenError(data.error || 'Failed to authenticate token.');
        }
    } catch (err) {
        showTokenError('Network error occurred. Please try again.');
        console.error(err);
    } finally {
        btnSaveToken.disabled = false;
        btnSaveToken.textContent = 'Connect Account';
    }
}

function showTokenError(msg) {
    tokenError.textContent = msg;
    tokenError.classList.remove('hidden');
}

async function logout() {
    if (confirm('Are you sure you want to disconnect your GitHub token?')) {
        try {
            await fetch('/api/logout', { method: 'POST' });
            window.location.reload();
        } catch (err) {
            console.error('Logout error:', err);
            // Fallback: reload anyway
            window.location.reload();
        }
    }
}

// Repositories Management
async function loadRepositories() {
    repoGrid.innerHTML = '<div class="loading-placeholder">Loading repositories...</div>';
    
    try {
        const response = await fetch('/api/repos');
        const data = await response.json();
        
        if (data.repos) {
            renderRepositories(data.repos);
        } else {
            repoGrid.innerHTML = `<div class="loading-placeholder text-error">${data.error || 'Failed to load repos'}</div>`;
        }
    } catch (err) {
        repoGrid.innerHTML = '<div class="loading-placeholder text-error">Failed to fetch repositories.</div>';
        console.error(err);
    }
}

function renderRepositories(repos) {
    if (repos.length === 0) {
        repoGrid.innerHTML = '<div class="loading-placeholder">No repositories found. Create one above!</div>';
        return;
    }
    
    repoGrid.innerHTML = '';
    repos.forEach(repo => {
        const card = document.createElement('div');
        card.className = 'repo-item';
        if (selectedRepo && selectedRepo.name === repo.name) {
            card.classList.add('selected');
        }
        
        card.innerHTML = `
            <div class="repo-name">${repo.name}</div>
            <div class="repo-desc">${repo.description || 'No description'}</div>
            <span class="repo-badge ${repo.private ? 'private' : 'public'}">${repo.private ? 'Private' : 'Public'}</span>
        `;
        
        card.addEventListener('click', () => {
            // Toggle selection
            const wasSelected = card.classList.contains('selected');
            document.querySelectorAll('.repo-item').forEach(el => el.classList.remove('selected'));
            
            if (wasSelected) {
                selectedRepo = null;
            } else {
                card.classList.add('selected');
                selectedRepo = repo;
            }
            updateUploadButtonState();
        });
        
        repoGrid.appendChild(card);
    });
}

async function createRepository() {
    const repoName = newRepoName.value.trim();
    if (!repoName) return;
    
    const visibilityElement = document.querySelector('input[name="repo-visibility"]:checked');
    const isPrivate = visibilityElement ? visibilityElement.value === 'private' : true;
    
    // Disable inputs
    newRepoName.disabled = true;
    btnCreateRepo.disabled = true;
    
    try {
        const response = await fetch('/api/repos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: repoName, private: isPrivate })
        });
        const data = await response.json();
        
        if (data.success) {
            newRepoName.value = '';
            selectedRepo = data.repo; // Auto-select the newly created repo
            await loadRepositories();
            updateUploadButtonState();
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (err) {
        console.error(err);
        alert('Failed to create repository due to a server error.');
    } finally {
        newRepoName.disabled = false;
        btnCreateRepo.disabled = false;
    }
}

// Local Files Management
async function loadLocalFiles() {
    const syncIcon = syncStatus.querySelector('.icon-sync');
    syncIcon.classList.add('rotating');
    
    try {
        const response = await fetch('/api/files');
        const data = await response.json();
        
        if (data.files) {
            localFiles = data.files;
            renderLocalFiles(data.files);
        }
    } catch (err) {
        console.error('Error fetching local files:', err);
    } finally {
        // Keep rotating briefly to look active, then stop
        setTimeout(() => {
            syncIcon.classList.remove('rotating');
        }, 800);
    }
}

// Helper to get extension color/svg
function getFileIconSVG(ext) {
    // Return custom SVG icons depending on the file extension
    let iconColor = '#8e9aaf'; // Default greyish blue
    
    if (ext === 'py') iconColor = '#3572A5';      // Python Blue
    else if (ext === 'js') iconColor = '#f1e05a';  // JS Yellow
    else if (ext === 'html') iconColor = '#e34c26';// HTML Red/Orange
    else if (ext === 'css') iconColor = '#563d7c'; // CSS Purple
    else if (ext === 'md') iconColor = '#083fa1';  // Markdown Blue
    else if (ext === 'json') iconColor = '#29c6cd';// JSON Cyan
    else if (ext === 'pdf') iconColor = '#ff4d4f'; // PDF Red
    
    // A nice file icon with the dynamic color matching the extension
    return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="16" y1="13" x2="8" y2="13"></line>
        <line x1="16" y1="17" x2="8" y2="17"></line>
        <polyline points="10 9 9 9 8 9"></polyline>
    </svg>`;
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function renderLocalFiles(files) {
    if (files.length === 0) {
        filesList.innerHTML = '<div class="no-files-placeholder">No files in "Github uploder" directory</div>';
        updateUploadButtonState();
        return;
    }
    
    // Keep track of scroll position
    const scrollTop = filesList.scrollTop;
    
    filesList.innerHTML = '';
    files.forEach(file => {
        const item = document.createElement('div');
        item.className = 'file-item';
        
        item.innerHTML = `
            <div class="file-info">
                <div class="file-icon">${getFileIconSVG(file.ext)}</div>
                <div class="file-name" title="${file.path}">${file.path}</div>
            </div>
            <div class="file-size">${formatBytes(file.size)}</div>
            <button class="btn-delete" title="Delete file from disk">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
        `;
        
        // Setup delete event listener
        item.querySelector('.btn-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteFile(file.path);
        });
        
        filesList.appendChild(item);
    });
    
    // Restore scroll position
    filesList.scrollTop = scrollTop;
    updateUploadButtonState();
}

async function deleteFile(filePath) {
    if (confirm(`Are you sure you want to permanently delete "${filePath}" from your local "Github uploder" folder?`)) {
        try {
            const response = await fetch('/api/files/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: filePath })
            });
            const data = await response.json();
            
            if (data.success) {
                loadLocalFiles();
            } else {
                alert(`Error deleting file: ${data.error}`);
            }
        } catch (err) {
            console.error(err);
            alert('Failed to delete file.');
        }
    }
}

function updateUploadButtonState() {
    if (selectedRepo && localFiles.length > 0) {
        btnUpload.disabled = false;
    } else {
        btnUpload.disabled = true;
    }
}

// Upload Execution
async function uploadFiles() {
    if (!selectedRepo || localFiles.length === 0) return;
    
    // Disable inputs
    setUIBlocked(true);
    
    // Setup Console
    consoleCard.classList.remove('hidden');
    consoleLog.innerHTML = '';
    logToConsole('Starting upload process to repository: ' + selectedRepo.name, 'info');
    
    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repo: selectedRepo.name })
        });
        const data = await response.json();
        
        if (response.status === 200 && data.success) {
            // Print results
            if (data.uploaded && data.uploaded.length > 0) {
                data.uploaded.forEach(file => {
                    logToConsole(`Successfully uploaded: ${file}`, 'success');
                });
            }
            if (data.skipped && data.skipped.length > 0) {
                data.skipped.forEach(file => {
                    logToConsole(`Skipped (identical on Github): ${file}`, 'warn');
                });
            }
            
            logToConsole('==========================================', 'info');
            logToConsole(`Upload complete! Successfully processed ${localFiles.length} files.`, 'success');
            logToConsole(`Uploaded: ${data.uploaded.length} | Skipped: ${data.skipped.length}`, 'success');
        } else {
            // Handle failures
            if (data.uploaded && data.uploaded.length > 0) {
                data.uploaded.forEach(file => {
                    logToConsole(`Uploaded: ${file}`, 'success');
                });
            }
            if (data.skipped && data.skipped.length > 0) {
                data.skipped.forEach(file => {
                    logToConsole(`Skipped: ${file}`, 'warn');
                });
            }
            if (data.failed && data.failed.length > 0) {
                data.failed.forEach(fail => {
                    logToConsole(`FAILED to upload ${fail.path}: ${fail.error}`, 'error');
                });
            }
            
            logToConsole('==========================================', 'info');
            logToConsole('Upload completed with errors. Please check the log above.', 'error');
        }
    } catch (err) {
        logToConsole('Server error occurred during upload: ' + err.message, 'error');
        console.error(err);
    } finally {
        setUIBlocked(false);
        // Refresh local files list in case something changed
        loadLocalFiles();
    }
}

function setUIBlocked(blocked) {
    btnUpload.disabled = blocked;
    newRepoName.disabled = blocked;
    btnCreateRepo.disabled = blocked;
    document.querySelectorAll('.repo-item').forEach(el => {
        if (blocked) {
            el.style.pointerEvents = 'none';
            el.style.opacity = '0.6';
        } else {
            el.style.pointerEvents = 'auto';
            el.style.opacity = '1';
        }
    });
    document.querySelectorAll('.btn-delete').forEach(el => {
        el.disabled = blocked;
    });
}

function logToConsole(message, type = 'info') {
    const line = document.createElement('div');
    line.className = `console-line ${type}`;
    
    // Add timestamp
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    line.textContent = `[${timeStr}] ${message}`;
    
    consoleLog.appendChild(line);
    consoleLog.scrollTop = consoleLog.scrollHeight;
}
