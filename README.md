# Github Uploader

A premium, modern desktop web application that allows you to easily sync and upload local project files to your GitHub repositories. Built with a **Python Flask** backend and a **Vanilla HTML/CSS/JS** glassmorphic frontend.

---

## Features

- **OAuth-like Token Authentication**: Save your GitHub Personal Access Token (PAT) locally and securely.
- **Repository Management**: Create new repositories (Private or Public) or select existing ones directly from a dashboard grid.
- **Real-Time Directory Syncing**: Periodically checks and displays files inside the local `Github uploder` folder.
- **Smart Upload ("Not Repeated Files")**: Computes local file Git SHA1 hashes and compares them to the remote repository. Identical files are automatically skipped to minimize API calls and redundant commits; only new or modified files are uploaded.
- **File Deletion**: Delete local files directly from the dashboard listing (with a safety confirmation prompt).
- **Windows Launcher**: Double-click `run.bat` to launch the application instantly.

---

## Prerequisites

- **Python 3.6+** (make sure it is added to your system PATH)

---

## Getting Started

1. Place the files/folders you wish to upload inside the `Github uploder` directory.
2. Double-click the **`run.bat`** file.
3. The launcher will verify dependencies (`flask`, `requests`), start the local server, and open `http://127.0.0.1:5000` in your web browser.
4. Input your GitHub Personal Access Token (PAT) with `repo` scope to link your account.
5. Select an existing repository from the grid or create a new one.
6. Click **Upload** to push your files to GitHub!
