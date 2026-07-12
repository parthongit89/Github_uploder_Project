import os
import json
import base64
import hashlib
import requests
from flask import Flask, request, jsonify, render_template, send_from_directory

app = Flask(__name__, static_folder='static', template_folder='templates')

CONFIG_FILE = 'config.json'
UPLOAD_DIR = os.path.join(os.getcwd(), 'Github uploder')

# Ensure the upload directory exists
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

def get_config_file(uid=None):
    if not uid or uid == 'null' or uid == 'undefined':
        return CONFIG_FILE
    sanitized_uid = "".join(c for c in uid if c.isalnum() or c in ('-', '_'))
    return f'config_{sanitized_uid}.json'

def load_config(uid=None):
    cfg_file = get_config_file(uid)
    if os.path.exists(cfg_file):
        try:
            with open(cfg_file, 'r') as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_config(config_data, uid=None):
    cfg_file = get_config_file(uid)
    with open(cfg_file, 'w') as f:
        json.dump(config_data, f, indent=4)

def get_git_sha1(filepath):
    """Calculate the Git blob SHA1 of a file."""
    try:
        with open(filepath, 'rb') as f:
            data = f.read()
        header = f"blob {len(data)}\0".encode('utf-8')
        sha1 = hashlib.sha1()
        sha1.update(header)
        sha1.update(data)
        return sha1.hexdigest()
    except Exception:
        return None

def get_github_headers(token):
    return {
        'Authorization': f'token {token}',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    }

@app.route('/')
def index():
    # Helper to render the frontend
    # Since we use templates/index.html, let's serve it via send_from_directory or render_template
    # To keep dependencies simple and avoid Jinja2 errors, we can just read the HTML file
    try:
        with open(os.path.join('templates', 'index.html'), 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        return f"Error loading index.html: {str(e)}", 500

@app.route('/api/config', methods=['GET', 'POST'])
def api_config():
    uid = request.headers.get('X-Firebase-UID')
    if request.method == 'GET':
        config = load_config(uid)
        token = config.get('token', '')
        if not token:
            return jsonify({'configured': False})
        
        # Verify token and get user info
        headers = get_github_headers(token)
        res = requests.get('https://api.github.com/user', headers=headers)
        if res.status_code == 200:
            user_data = res.json()
            return jsonify({
                'configured': True,
                'username': user_data.get('login'),
                'avatar_url': user_data.get('avatar_url')
            })
        else:
            return jsonify({'configured': False, 'error': 'Invalid token saved'})

    elif request.method == 'POST':
        data = request.json or {}
        token = data.get('token', '').strip()
        if not token:
            return jsonify({'success': False, 'error': 'Token is required'}), 400
        
        headers = get_github_headers(token)
        res = requests.get('https://api.github.com/user', headers=headers)
        if res.status_code == 200:
            user_data = res.json()
            save_config({'token': token}, uid)
            return jsonify({
                'success': True,
                'username': user_data.get('login'),
                'avatar_url': user_data.get('avatar_url')
            })
        else:
            return jsonify({'success': False, 'error': f'Failed to authenticate: {res.text}'}), 401

@app.route('/api/repos', methods=['GET', 'POST'])
def api_repos():
    uid = request.headers.get('X-Firebase-UID')
    config = load_config(uid)
    if not config.get('token'):
        return jsonify({'error': 'Unauthorized'}), 401
    
    headers = get_github_headers(token)

    if request.method == 'GET':
        # List repositories (owner only, up to 100, sorted by updated)
        res = requests.get('https://api.github.com/user/repos?per_page=100&type=owner&sort=updated', headers=headers)
        if res.status_code == 200:
            repos = []
            for r in res.json():
                repos.append({
                    'name': r.get('name'),
                    'full_name': r.get('full_name'),
                    'private': r.get('private'),
                    'description': r.get('description', '')
                })
            return jsonify({'repos': repos})
        else:
            return jsonify({'error': f'Failed to fetch repos: {res.text}'}), res.status_code

    elif request.method == 'POST':
        data = request.json or {}
        repo_name = data.get('name', '').strip()
        is_private = data.get('private', True)
        if not repo_name:
            return jsonify({'error': 'Repository name is required'}), 400
        
        payload = {
            'name': repo_name,
            'private': is_private,
            'auto_init': True  # Initialize with a README to create default branch
        }
        res = requests.post('https://api.github.com/user/repos', json=payload, headers=headers)
        if res.status_code == 201:
            r = res.json()
            return jsonify({
                'success': True,
                'repo': {
                    'name': r.get('name'),
                    'full_name': r.get('full_name'),
                    'private': r.get('private'),
                    'description': r.get('description', '')
                }
            })
        else:
            return jsonify({'error': f'Failed to create repository: {res.text}'}), res.status_code

@app.route('/api/files', methods=['GET'])
def api_files():
    """List all files inside the local 'Github uploder' directory."""
    if not os.path.exists(UPLOAD_DIR):
        return jsonify({'files': []})
    
    file_list = []
    for root, dirs, files in os.walk(UPLOAD_DIR):
        # Exclude hidden directories (like .git)
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        
        for file in files:
            # Skip operating system files, sensitive credentials, and hidden files
            if file.lower() in ('desktop.ini', '.ds_store', 'thumbs.db', 'config.json', '.env') or file.startswith('.'):
                continue
            
            abs_path = os.path.join(root, file)
            rel_path = os.path.relpath(abs_path, UPLOAD_DIR).replace('\\', '/')
            
            # File size in bytes
            size = os.path.getsize(abs_path)
            
            # Extension to guess icon
            ext = os.path.splitext(file)[1].lower().replace('.', '')
            
            file_list.append({
                'name': file,
                'path': rel_path,
                'size': size,
                'ext': ext
            })
            
    # Sort files by path alphabetically
    file_list.sort(key=lambda x: x['path'])
    return jsonify({'files': file_list})

@app.route('/api/files/delete', methods=['POST'])
def api_delete_file():
    """Delete a specific local file in the upload directory."""
    data = request.json or {}
    rel_path = data.get('path')
    if not rel_path:
        return jsonify({'error': 'File path is required'}), 400
    
    # Security check: prevent directory traversal
    abs_path = os.path.abspath(os.path.join(UPLOAD_DIR, rel_path))
    if not abs_path.startswith(os.path.abspath(UPLOAD_DIR)):
        return jsonify({'error': 'Access denied'}), 403
    
    if os.path.exists(abs_path) and os.path.isfile(abs_path):
        try:
            os.remove(abs_path)
            return jsonify({'success': True})
        except Exception as e:
            return jsonify({'error': f'Failed to delete file: {str(e)}'}), 500
    else:
        return jsonify({'error': 'File not found'}), 404

@app.route('/api/upload', methods=['POST'])
def api_upload():
    """Upload files from local directory to selected repository, skipping repeated files."""
    uid = request.headers.get('X-Firebase-UID')
    config = load_config(uid)
    token = config.get('token')
    if not token:
        return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.json or {}
    repo_name = data.get('repo')
    if not repo_name:
        return jsonify({'error': 'Repository name is required'}), 400
    
    headers = get_github_headers(token)
    
    # Get user profile to know the owner
    user_res = requests.get('https://api.github.com/user', headers=headers)
    if user_res.status_code != 200:
        return jsonify({'error': 'Failed to verify user token'}), 401
    owner = user_res.json().get('login')
    
    # Get repository details (e.g. to find default branch)
    repo_url = f'https://api.github.com/repos/{owner}/{repo_name}'
    repo_res = requests.get(repo_url, headers=headers)
    if repo_res.status_code != 200:
        return jsonify({'error': f'Repository not found: {repo_res.text}'}), 404
    
    repo_info = repo_res.json()
    default_branch = repo_info.get('default_branch', 'main')
    
    # Fetch remote file tree to check for existing files and hashes
    remote_files = {}  # maps path -> sha
    tree_url = f'https://api.github.com/repos/{owner}/{repo_name}/git/trees/{default_branch}?recursive=1'
    tree_res = requests.get(tree_url, headers=headers)
    
    # Note: If the repo is empty (created with auto_init=false or empty tree), it returns 409 Conflict.
    # We will treat this as tree_res not OK and empty remote files dictionary.
    if tree_res.status_code == 200:
        tree_data = tree_res.json()
        for item in tree_data.get('tree', []):
            if item.get('type') == 'blob':
                remote_files[item.get('path')] = item.get('sha')
    
    # Scan local files
    local_files = []
    for root, dirs, files in os.walk(UPLOAD_DIR):
        # Exclude hidden directories (like .git)
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        
        for file in files:
            # Skip operating system files, sensitive credentials, and hidden files
            if file.lower() in ('desktop.ini', '.ds_store', 'thumbs.db', 'config.json', '.env') or file.startswith('.'):
                continue
            abs_path = os.path.join(root, file)
            rel_path = os.path.relpath(abs_path, UPLOAD_DIR).replace('\\', '/')
            local_files.append((abs_path, rel_path))
            
    if not local_files:
        return jsonify({'success': True, 'uploaded': [], 'skipped': [], 'message': 'No local files to upload'})
    
    uploaded_paths = []
    skipped_paths = []
    failed_paths = []
    
    for abs_path, rel_path in local_files:
        local_sha = get_git_sha1(abs_path)
        remote_sha = remote_files.get(rel_path)
        
        # Skip if remote file matches exactly
        if remote_sha == local_sha:
            skipped_paths.append(rel_path)
            continue
        
        # Otherwise, upload/update the file
        try:
            with open(abs_path, 'rb') as f:
                content_bytes = f.read()
            content_b64 = base64.b64encode(content_bytes).decode('utf-8')
            
            # Put content
            put_url = f'https://api.github.com/repos/{owner}/{repo_name}/contents/{rel_path}'
            put_payload = {
                'message': f'Upload {rel_path} via Github Uploader',
                'content': content_b64,
                'branch': default_branch
            }
            # If the remote file exists (but differs), we must include the remote SHA
            if remote_sha:
                put_payload['sha'] = remote_sha
                
            put_res = requests.put(put_url, json=put_payload, headers=headers)
            if put_res.status_code in (200, 201):
                uploaded_paths.append(rel_path)
            else:
                failed_paths.append({
                    'path': rel_path,
                    'error': f'HTTP {put_res.status_code}: {put_res.text}'
                })
        except Exception as e:
            failed_paths.append({
                'path': rel_path,
                'error': str(e)
            })
            
    return jsonify({
        'success': len(failed_paths) == 0,
        'uploaded': uploaded_paths,
        'skipped': skipped_paths,
        'failed': failed_paths
    })

@app.route('/api/logout', methods=['POST'])
def api_logout():
    uid = request.headers.get('X-Firebase-UID')
    cfg_file = get_config_file(uid)
    try:
        if os.path.exists(cfg_file):
            os.remove(cfg_file)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

import traceback

@app.errorhandler(500)
@app.errorhandler(Exception)
def handle_exception(e):
    from werkzeug.exceptions import HTTPException
    if isinstance(e, HTTPException):
        return jsonify({'error': e.description}), e.code
    tb = traceback.format_exc()
    print("SERVER ERROR:\n", tb)
    return jsonify({
        'error': str(e),
        'traceback': tb
    }), 500

# Serve assets
@app.route('/assets/<path:filename>')
def serve_assets(filename):
    # Assets (like Ellipse or GitHub Octocat images) are in the workspace root.
    return send_from_directory(os.getcwd(), filename)

if __name__ == '__main__':
    # Start the server locally only (binds to 127.0.0.1 to prevent external network access)
    app.run(host='127.0.0.1', port=5000, debug=False)
