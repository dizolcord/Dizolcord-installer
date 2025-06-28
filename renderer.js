function runInstall() {
  const output = document.getElementById('output');
  output.textContent = ''; // Clear previous output
  window.ipcRenderer.send('run-install');
}

function runUninstall() {
  const output = document.getElementById('output');
  output.textContent = ''; // Clear previous output
  window.ipcRenderer.send('run-uninstall');
}

window.ipcRenderer.on('install-result', (_event, message) => {
  const output = document.getElementById('output');
  output.textContent += message + '\n';
  output.scrollTop = output.scrollHeight;
});
