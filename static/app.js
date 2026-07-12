// Import Firebase SDKs from official CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDXCG9WVT11tbLvR91mUO7Pwx1I1sWORPM",
  authDomain: "github-uploder.firebaseapp.com",
  projectId: "github-uploder",
  storageBucket: "github-uploder.firebasestorage.app",
  messagingSenderId: "1015469425217",
  appId: "1:1015469425217:web:ae48565f76e8b913f73cc0",
  measurementId: "G-5MC28DDBGW"
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const googleProvider = new GoogleAuthProvider();

// State variables
let currentUser = null;
let isAuthenticated = false;
let selectedRepo = null;
let localFiles = [];
let webSelectedFiles = [];
let syncInterval = null;

// DOM Elements
const webFileInput = document.getElementById('web-file-input');

// DOM Elements
const authModal = document.getElementById('auth-modal');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const btnAuthAction = document.getElementById('btn-auth-action');
const btnGoogleAuth = document.getElementById('btn-google-auth');
const linkToggleAuth = document.getElementById('link-toggle-auth');
const authTitle = document.getElementById('auth-title');
const authDesc = document.getElementById('auth-desc');
const authError = document.getElementById('auth-error');
const authToggleText = document.getElementById('auth-toggle-text');

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

// Mode tracking for Firebase auth (either 'signin' or 'signup')
let authMode = 'signin';

// Initialization and state listeners
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    
    // Listen for Firebase Auth state changes
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            authModal.classList.add('hidden');
            checkAuthentication();
            
            // Load local files
            loadLocalFiles();
            
            // Start polling local directory every 3 seconds for real-time syncing
            if (syncInterval) clearInterval(syncInterval);
            syncInterval = setInterval(loadLocalFiles, 3000);
        } else {
            currentUser = null;
            authModal.classList.remove('hidden');
            tokenModal.classList.add('hidden');
            userProfile.classList.add('hidden');
            if (syncInterval) clearInterval(syncInterval);
        }
    });
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
    
    // Web Drag & Drop / File Select Listeners
    webFileInput.addEventListener('change', handleWebFileSelect);
    
    filesList.addEventListener('click', (e) => {
        const dropzone = e.target.closest('.dropzone');
        if (dropzone) {
            webFileInput.click();
        }
    });
    
    filesList.addEventListener('dragover', (e) => {
        const dropzone = e.target.closest('.dropzone');
        if (dropzone) {
            e.preventDefault();
            dropzone.classList.add('dragover');
        }
    });
    
    filesList.addEventListener('dragleave', (e) => {
        const dropzone = e.target.closest('.dropzone');
        if (dropzone) {
            dropzone.classList.remove('dragover');
        }
    });
    
    filesList.addEventListener('drop', (e) => {
        const dropzone = e.target.closest('.dropzone');
        if (dropzone) {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) {
                addWebFiles(e.dataTransfer.files);
            }
        }
    });
    
    // Auth listeners
    btnAuthAction.addEventListener('click', handleAuthAction);
    btnGoogleAuth.addEventListener('click', handleGoogleAuth);
    authPassword.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAuthAction();
    });
    linkToggleAuth.addEventListener('click', (e) => {
        e.preventDefault();
        toggleAuthMode();
    });
}

// Fetch helper with User UID header injection
async function fetchWithAuth(url, options = {}) {
    if (!options.headers) {
        options.headers = {};
    }
    if (currentUser) {
        options.headers['X-Firebase-UID'] = currentUser.uid;
        options.headers['Content-Type'] = 'application/json';
    }
    return fetch(url, options);
}

// Firebase Authentication Handlers
function handleWebFileSelect(e) {
    if (e.target.files.length > 0) {
        addWebFiles(e.target.files);
    }
}

function addWebFiles(filesListObj) {
    for (let i = 0; i < filesListObj.length; i++) {
        const file = filesListObj[i];
        if (!webSelectedFiles.some(f => f.name === file.name)) {
            webSelectedFiles.push(file);
        }
    }
    renderLocalFiles(localFiles);
}
function toggleAuthMode() {
    authError.classList.add('hidden');
    authEmail.value = '';
    authPassword.value = '';
    
    if (authMode === 'signin') {
        authMode = 'signup';
        authTitle.textContent = 'Sign Up';
        authDesc.textContent = 'Create an account to start using Github Uploader.';
        btnAuthAction.textContent = 'Sign Up';
        authToggleText.textContent = 'Already have an account?';
        linkToggleAuth.textContent = 'Sign In';
    } else {
        authMode = 'signin';
        authTitle.textContent = 'Sign In';
        authDesc.textContent = 'Welcome to Github Uploader. Log in to continue.';
        btnAuthAction.textContent = 'Sign In';
        authToggleText.textContent = "Don't have an account?";
        linkToggleAuth.textContent = 'Sign Up';
    }
}

async function handleAuthAction() {
    const email = authEmail.value.trim();
    const password = authPassword.value.trim();
    
    if (!email || !password) {
        showAuthError('Email and password are required.');
        return;
    }
    
    btnAuthAction.disabled = true;
    btnAuthAction.textContent = authMode === 'signin' ? 'Signing In...' : 'Signing Up...';
    authError.classList.add('hidden');
    
    try {
        if (authMode === 'signin') {
            await signInWithEmailAndPassword(auth, email, password);
            showToast('Signed in successfully!', 'success');
        } else {
            await createUserWithEmailAndPassword(auth, email, password);
            showToast('Account created successfully!', 'success');
        }
    } catch (err) {
        console.error(err);
        let errorMsg = 'Authentication failed.';
        if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
            errorMsg = 'Invalid email or password.';
        } else if (err.code === 'auth/email-already-in-use') {
            errorMsg = 'This email is already in use.';
        } else if (err.code === 'auth/weak-password') {
            errorMsg = 'Password should be at least 6 characters.';
        } else if (err.code === 'auth/invalid-email') {
            errorMsg = 'Please enter a valid email address.';
        }
        showAuthError(errorMsg);
    } finally {
        btnAuthAction.disabled = false;
        btnAuthAction.textContent = authMode === 'signin' ? 'Sign In' : 'Sign Up';
    }
}

async function handleGoogleAuth() {
    btnGoogleAuth.disabled = true;
    btnGoogleAuth.textContent = 'Connecting Google...';
    authError.classList.add('hidden');
    
    try {
        await signInWithPopup(auth, googleProvider);
        showToast('Signed in with Google successfully!', 'success');
    } catch (err) {
        console.error(err);
        showAuthError(err.message || 'Google authentication failed.');
    } finally {
        btnGoogleAuth.disabled = false;
        btnGoogleAuth.innerHTML = `
            <svg viewBox="0 0 24 24" width="18" height="18" class="google-icon">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            Continue with Google
        `;
    }
}

function showAuthError(msg) {
    authError.textContent = msg;
    authError.classList.remove('hidden');
}

// GitHub Token Authentication Checks
async function checkAuthentication() {
    try {
        const response = await fetchWithAuth('/api/config');
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP ${response.status}`);
        }
        const data = await response.json();
        
        if (data.configured) {
            isAuthenticated = true;
            tokenModal.classList.add('hidden');
            showUserProfile(data.username, data.avatar_url);
            loadRepositories();
        } else {
            isAuthenticated = false;
            tokenModal.classList.remove('hidden');
            repoGrid.innerHTML = '<div class="loading-placeholder">Connect GitHub to view repositories</div>';
            if (data.error) {
                showTokenError(data.error);
            }
        }
    } catch (err) {
        console.error('Error checking authentication:', err);
        showToast(`Authentication check failed: ${err.message}`, 'error');
        // Fallback: show token modal so the user isn't stuck
        isAuthenticated = false;
        tokenModal.classList.remove('hidden');
        repoGrid.innerHTML = '<div class="loading-placeholder text-error">Failed to check GitHub link</div>';
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
        const response = await fetchWithAuth('/api/config', {
            method: 'POST',
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
    showConfirm('Are you sure you want to disconnect your GitHub token and log out?', async () => {
        try {
            // First clear github token on backend for this user
            await fetchWithAuth('/api/logout', { method: 'POST' });
            
            // Then sign out of Firebase
            await signOut(auth);
            showToast('Logged out successfully.', 'success');
        } catch (err) {
            console.error('Logout error:', err);
            // Sign out of Firebase anyway
            await signOut(auth);
        }
    });
}

// Repositories Management
async function loadRepositories() {
    repoGrid.innerHTML = '<div class="loading-placeholder">Loading repositories...</div>';
    
    try {
        const response = await fetchWithAuth('/api/repos');
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const errMsg = errData.error || `HTTP ${response.status}`;
            if (response.status === 401) {
                checkAuthentication();
            }
            throw new Error(errMsg);
        }
        const data = await response.json();
        
        if (data.repos) {
            renderRepositories(data.repos);
        } else {
            repoGrid.innerHTML = `<div class="loading-placeholder text-error">${data.error || 'Failed to load repos'}</div>`;
        }
    } catch (err) {
        repoGrid.innerHTML = `<div class="loading-placeholder text-error">Failed to fetch repositories: ${err.message}</div>`;
        console.error(err);
        showToast(`Repos load failed: ${err.message}`, 'error');
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
        const response = await fetchWithAuth('/api/repos', {
            method: 'POST',
            body: JSON.stringify({ name: repoName, private: isPrivate })
        });
        const data = await response.json();
        
        if (data.success) {
            newRepoName.value = '';
            selectedRepo = data.repo; // Auto-select the newly created repo
            await loadRepositories();
            updateUploadButtonState();
            showToast('Repository created successfully!', 'success');
        } else {
            showToast(`Error: ${data.error}`, 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Failed to create repository due to a server error.', 'error');
    } finally {
        newRepoName.disabled = false;
        btnCreateRepo.disabled = false;
    }
}

// Local Files Management
async function loadLocalFiles() {
    // Only fetch if authenticated via Firebase
    if (!currentUser) return;
    
    const syncIcon = syncStatus.querySelector('.icon-sync');
    syncIcon.classList.add('rotating');
    
    try {
        const response = await fetchWithAuth('/api/files');
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
    let iconColor = '#8e9aaf'; // Default greyish blue
    
    if (ext === 'py') iconColor = '#3572A5';      // Python Blue
    else if (ext === 'js') iconColor = '#f1e05a';  // JS Yellow
    else if (ext === 'html') iconColor = '#e34c26';// HTML Red/Orange
    else if (ext === 'css') iconColor = '#563d7c'; // CSS Purple
    else if (ext === 'md') iconColor = '#083fa1';  // Markdown Blue
    else if (ext === 'json') iconColor = '#29c6cd';// JSON Cyan
    else if (ext === 'pdf') iconColor = '#ff4d4f'; // PDF Red
    
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
    if (files.length === 0 && webSelectedFiles.length === 0) {
        filesList.innerHTML = `
            <div id="dropzone" class="dropzone">
                <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" class="dropzone-icon">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                <div class="dropzone-text">Drag & drop files here or <span class="browse-link">browse</span></div>
            </div>
        `;
        updateUploadButtonState();
        return;
    }
    
    const scrollTop = filesList.scrollTop;
    filesList.innerHTML = '';
    
    // Choose list content
    const displayFiles = webSelectedFiles.length > 0 ?
        webSelectedFiles.map(f => ({ name: f.name, path: f.name, size: f.size, ext: f.name.split('.').pop().toLowerCase(), isWeb: true })) :
        files;
    
    displayFiles.forEach(file => {
        const item = document.createElement('div');
        item.className = 'file-item';
        
        item.innerHTML = `
            <div class="file-info">
                <div class="file-icon">${getFileIconSVG(file.ext)}</div>
                <div class="file-name" title="${file.path}">${file.path}</div>
            </div>
            <div class="file-size">${formatBytes(file.size)}</div>
            <button class="btn-delete" title="Remove file">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
        `;
        
        item.querySelector('.btn-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            if (file.isWeb) {
                webSelectedFiles = webSelectedFiles.filter(f => f.name !== file.name);
                renderLocalFiles(localFiles);
            } else {
                deleteFile(file.path);
            }
        });
        
        filesList.appendChild(item);
    });
    
    filesList.scrollTop = scrollTop;
    updateUploadButtonState();
}

async function deleteFile(filePath) {
    showConfirm(`Are you sure you want to permanently delete "${filePath}" from your local "Github uploder" folder?`, async () => {
        try {
            const response = await fetchWithAuth('/api/files/delete', {
                method: 'POST',
                body: JSON.stringify({ path: filePath })
            });
            const data = await response.json();
            
            if (data.success) {
                loadLocalFiles();
                showToast('File deleted successfully.', 'success');
            } else {
                showToast(`Error deleting file: ${data.error}`, 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Failed to delete file.', 'error');
        }
    });
}

function updateUploadButtonState() {
    if (selectedRepo && (localFiles.length > 0 || webSelectedFiles.length > 0)) {
        btnUpload.disabled = false;
    } else {
        btnUpload.disabled = true;
    }
}

// Upload Execution
async function uploadFiles() {
    if (!selectedRepo) return;
    
    setUIBlocked(true);
    btnUpload.textContent = 'Uploading...';
    
    try {
        if (webSelectedFiles.length > 0) {
            const filesPayload = [];
            for (let i = 0; i < webSelectedFiles.length; i++) {
                const file = webSelectedFiles[i];
                const base64Data = await readFileAsBase64(file);
                filesPayload.push({
                    name: file.name,
                    content: base64Data
                });
            }
            
            const response = await fetchWithAuth('/api/upload-dropped', {
                method: 'POST',
                body: JSON.stringify({
                    repo: selectedRepo.name,
                    files: filesPayload
                })
            });
            const data = await response.json();
            
            if (response.status === 200 && data.success) {
                showToast('Upload completed successfully!', 'success');
                webSelectedFiles = [];
            } else {
                if (response.status === 401) {
                    checkAuthentication();
                }
                showToast(data.error || 'Upload completed with some errors.', 'error');
            }
        } else {
            if (localFiles.length === 0) return;
            const response = await fetchWithAuth('/api/upload', {
                method: 'POST',
                body: JSON.stringify({ repo: selectedRepo.name })
            });
            const data = await response.json();
            
            if (response.status === 200 && data.success) {
                showToast('Upload completed successfully!', 'success');
            } else {
                if (response.status === 401) {
                    checkAuthentication();
                }
                showToast(data.error || 'Upload completed with some errors.', 'error');
            }
        }
    } catch (err) {
        showToast('Server error occurred during upload: ' + err.message, 'error');
        console.error(err);
    } finally {
        setUIBlocked(false);
        btnUpload.textContent = 'Upload';
        loadLocalFiles();
    }
}

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64String = reader.result.split(',')[1];
            resolve(base64String);
        };
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
    });
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

// Toast helper
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast-item ${type}`;
    
    let iconSVG = '';
    if (type === 'success') {
        iconSVG = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#2ec4b6" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else if (type === 'error') {
        iconSVG = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#ff4d4f" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
    } else { // info
        iconSVG = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#9d4edd" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }
    
    toast.innerHTML = `
        <div class="toast-icon">${iconSVG}</div>
        <div class="toast-message">${message}</div>
        <button class="toast-close">&times;</button>
    `;
    
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => removeToast(toast));
    
    container.appendChild(toast);
    
    setTimeout(() => {
        removeToast(toast);
    }, 4000);
}

function removeToast(toast) {
    if (toast.parentNode) {
        toast.style.animation = 'fadeOut 0.25s ease forwards';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 250);
    }
}

// Custom confirm popup helper
function showConfirm(message, onConfirm, onCancel = null) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const existing = container.querySelector('.confirm-card');
    if (existing) {
        if (existing.onCancelCallback) existing.onCancelCallback();
        container.removeChild(existing);
    }
    
    const card = document.createElement('div');
    card.className = 'confirm-card';
    card.onCancelCallback = onCancel;
    
    card.innerHTML = `
        <div class="confirm-text">${message}</div>
        <div class="confirm-buttons">
            <button class="btn-cancel">Cancel</button>
            <button class="btn-confirm">Yes</button>
        </div>
    `;
    
    const btnCancel = card.querySelector('.btn-cancel');
    const btnConfirm = card.querySelector('.btn-confirm');
    
    const removeCard = () => {
        card.style.animation = 'fadeOut 0.25s ease forwards';
        setTimeout(() => {
            if (card.parentNode) {
                container.removeChild(card);
            }
        }, 250);
    };
    
    btnCancel.addEventListener('click', () => {
        removeCard();
        if (onCancel) onCancel();
    });
    
    btnConfirm.addEventListener('click', () => {
        removeCard();
        if (onConfirm) onConfirm();
    });
    
    container.appendChild(card);
}

// Global JS error reporting to UI toasts
window.addEventListener('error', (e) => {
    // Ignore firebase domain check errors that we already handle or general benign ones
    if (e.message && e.message.includes('ResizeObserver')) return;
    showToast(`JS Error: ${e.message}`, 'error');
});

window.addEventListener('unhandledrejection', (e) => {
    const msg = e.reason ? (e.reason.message || e.reason) : 'Promise rejected';
    showToast(`Promise Error: ${msg}`, 'error');
});
