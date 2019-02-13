const electron = require('electron')
const { spawn } = require('child_process');
const ps = require('process');
const http = require('http');
const os = require('os');
const fs = require('fs');

// Module to control application life.
const app = electron.app;
const protocol = electron.protocol;

// Module to create native browser window.
const BrowserWindow = electron.BrowserWindow;

const path = require('path')
const url = require('url')

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

let pid;

// TODO: Make this all configurable
const HOST = '127.0.0.1';
const PORT = '17328';
const ADDRESS = `${HOST}:${PORT}`
const HTTP_ADDRESS = `http://${ADDRESS}`;

function createWindow () {
  // Create the browser window.

  if (!mainWindow) {
    mainWindow = new BrowserWindow({
      width: 1280, 
      height: 1024, 
      title: "MicroSPAT",
    });
  }

  mainWindow.loadURL(url.format({
    pathname: 'index.html',
    protocol: 'file',
    slashes: true
  }));

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null
  })

}


function acquireProcessOrStartServer() {
  let tmpPath = os.tmpdir()
  let serverPath;
  let logFile = fs.createWriteStream(path.join(os.tmpdir(), 'mspat.engineio.log'), {flags: 'a'});
  let env = Object.create(process.env);
  // env.CONFIG = 'Production'; // Not used currently

  if (ps.platform === 'win32') {
    serverPath = __dirname.split("\\");
    serverPath = serverPath.slice(0, serverPath.length - 1);
    serverPath = serverPath.join("\\");
  } else {
    serverPath = __dirname.split("/");
    serverPath = serverPath.slice(0, serverPath.length - 1);
    serverPath = serverPath.join("/");
  }
  
  // Check if the lock file and PID already exist
  if (!fs.existsSync(path.join(tmpPath, 'mspatpid.lock'))) {
    // Doesn't exist, start process
    microspat = spawn(path.join(serverPath, 'app.asar.unpacked', 'mspat-server', ps.platform, 'run', 'run'), args=[], options={
      env: env,
    })
    microspat.stdout.pipe(logFile);
    microspat.stderr.pipe(logFile);
    fs.writeFileSync(path.join(tmpPath, 'mspatpid.lock'), microspat.pid);
    return microspat.pid;
  } else {
    pid = fs.readFileSync(path.join(tmpPath, 'mspatpid.lock'))
    // PID file exists, lets see if we can recover the process
    try {
      // PID recovered
      ps.kill(pid, 0);
      return pid;
    } catch(e) {
      // PID not recovered, delete PID lock and start new instance
      microspat = spawn(path.join(serverPath, 'app.asar.unpacked', 'mspat-server', ps.platform, 'run', 'run'), args=[], options={
        env: env,
      })
      microspat.stdout.pipe(logFile);
      microspat.stderr.pipe(logFile);
      fs.writeFileSync(path.join(tmpPath, 'mspatpid.lock'), microspat.pid);
      return microspat.pid;
    }
  }
}

// Increase memory allowed
// app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {

  pid = acquireProcessOrStartServer();

  // Make electron serve local files called from the app.
  protocol.interceptFileProtocol('file', (request, callback) => {
    const item_url = request.url.substr(7);
    callback({ path: path.normalize(`${__dirname}/mspat-app/${item_url}`)})
  }, (err) => {
    if (err) console.error('Failed to register protocol');
  });

  let p = setInterval(() => {
    http.get(`${HTTP_ADDRESS}/status`, (response) => {
      response.on('data', (chunk) => {
        clearInterval(p);
        createWindow();
      });
    }).on('error', () => {
      console.log("Failed");
    });
  }, 1000)
  
});

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow()
  }
})

app.on('quit', function() {
  try {
    ps.kill(pid);
    fs.unlinkSync(path.join(os.tmpdir(), 'mspatpid.lock'));
  } catch(error) {
    // TODO: figure out error handling here
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
