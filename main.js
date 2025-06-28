const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync, spawn } = require('child_process');
const robot = require('robotjs');

let isRunning = false; // <--- LOCK FLAG

function createWindow() {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });
  win.maximize();
  win.show();
  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

function discordInstalled() {
  const discordPath = path.join(process.env.LOCALAPPDATA || '', 'Discord');
  return fs.existsSync(discordPath);
}

function checkGit() {
  try {
    execSync('git --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function promptGitInstall() {
  shell.openExternal('https://git-scm.com/download/win');
}

function killDiscordProcesses() {
  try {
    execSync('taskkill /IM Discord.exe /F', { stdio: 'ignore' });
    execSync('taskkill /IM DiscordCanary.exe /F', { stdio: 'ignore' });
    execSync('taskkill /IM DiscordPTB.exe /F', { stdio: 'ignore' });
  } catch {
    // Ignore
  }
}

function runCommand(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, shell: true, stdio: 'inherit' });
    proc.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

async function cloneRepo(repoUrl, targetPath) {
  if (fs.existsSync(targetPath)) return;
  await runCommand('git', ['clone', repoUrl, targetPath]);
}

async function copyPlugins(tempDir, pluginsDir) {
  if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });
  const files = fs.readdirSync(tempDir);
  for (const file of files) {
    const srcPath = path.join(tempDir, file);
    const destPath = path.join(pluginsDir, file);
    fs.renameSync(srcPath, destPath);
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
}

function runPnpmInjectAutoInput(cwd, event, mode = 'install') {
  return new Promise((resolve, reject) => {
    // Spawn cmd with pnpm inject inside the cwd
    // Use shell true so 'start' and cmd work properly on Windows
    const child = spawn('cmd', ['/c', 'start', 'cmd', '/k', 'pnpm inject'], {
      cwd,
      shell: true,
      detached: true,
      stdio: 'ignore', // can't interact with stdin/stdout here
    });

    child.unref();

    // Wait a little so the cmd window has time to open and get focus
    setTimeout(() => {
      if (mode === 'install') {
        // Send Enter key press globally
        robot.keyTap('enter');
        setTimeout(() => { robot.keyTap('enter'); },1000);
        resolve();
      } else if (mode === 'uninstall') {
        event.reply('install-result', 'Please select in the opened window : hit enter.');
        resolve();
      } else {
        reject(new Error(`Unknown mode: ${mode}`));
      }
    }, 1000); // 1 second delay (adjust if needed)
  });
}

ipcMain.on('run-install', async (event) => {
  if (isRunning) {
    event.reply('install-result', 'Another operation is already running. Please wait.');
    return;
  }
  isRunning = true;

  try {
    event.reply('install-result', 'Starting installation...');

    killDiscordProcesses();

    if (!discordInstalled()) {
      event.reply('install-result', 'Discord is not installed. Please install Discord first.');
      isRunning = false;
      return;
    }

    if (!checkGit()) {
      event.reply('install-result', 'Git is not installed. Opening download page...');
      promptGitInstall();
      isRunning = false;
      return;
    }

    const documentsPath = path.join(os.homedir(), 'Documents');
    const dizolcordPath = path.join(documentsPath, 'dizolcord');
    const pluginsTempPath = path.join(dizolcordPath, 'temp_plugins');
    const pluginsDir = path.join(dizolcordPath, 'src', 'userplugins');

    event.reply('install-result', 'Cloning Dizolcord repository...');
    await cloneRepo('https://github.com/dizolcord/Dizolcord.git', dizolcordPath);

    event.reply('install-result', 'Installing pnpm globally...');
    await runCommand('npm', ['install', '-g', 'pnpm']);

    event.reply('install-result', 'Running pnpm install in Dizolcord folder...');
    await runCommand('pnpm', ['install'], dizolcordPath);

    event.reply('install-result', 'Cloning plugins repository...');
    if (fs.existsSync(pluginsTempPath)) fs.rmSync(pluginsTempPath, { recursive: true, force: true });
    await cloneRepo('https://github.com/dizolcord/plugins.git', pluginsTempPath);

    event.reply('install-result', 'Copying plugins into userplugins folder...');
    copyPlugins(pluginsTempPath, pluginsDir);

    event.reply('install-result', 'Building Dizolcord...');
    await runCommand('pnpm', ['build'], dizolcordPath);

    event.reply('install-result', 'Running pnpm inject with auto install input...');
    await runPnpmInjectAutoInput(dizolcordPath, event, 'install');

    event.reply('install-result', 'Installation complete!');
  } catch (error) {
    event.reply('install-result', `Installation failed: ${error.message}`);
  } finally {
    isRunning = false;
  }
});

ipcMain.on('run-uninstall', async (event) => {
  if (isRunning) {
    event.reply('install-result', 'Another operation is already running. Please wait.');
    return;
  }
  isRunning = true;

  try {
    killDiscordProcesses();

    const dizolcordPath = path.join(os.homedir(), 'Documents', 'dizolcord');

    if (!fs.existsSync(dizolcordPath)) {
      event.reply('install-result', 'Dizolcord folder not found. Nothing to uninstall.');
      isRunning = false;
      return;
    }

    event.reply('install-result', 'Running pnpm inject with uninstall input...');
    await runPnpmInjectAutoInput(dizolcordPath, event, 'uninstall');

    // Removed folder deletion to avoid EBUSY error (folder locked)
    // fs.rmSync(dizolcordPath, { recursive: true, force: true });
  } catch (error) {
    event.reply('install-result', `Uninstall failed: ${error.message}`);
  } finally {
    isRunning = false;
  }
});
