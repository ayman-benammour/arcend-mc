const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const configPath = path.join(__dirname, "../config/app.json");
const fs = require("fs");

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 650,
    resizable: false,
    backgroundColor: "#0E0E11",
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    }
  });

  win.loadFile(path.join(__dirname, "../app/index.html"));
}

app.whenReady().then(createWindow);

ipcMain.on("play", () => {
  console.log("play");
});

ipcMain.on("set-ram", (_, value) => {
    const configPath = "config/app.json";
    const config = JSON.parse(fs.readFileSync(configPath));
    config.ram = value;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log("RAM définie à", value, "GB");
  });

ipcMain.handle("get-config", () => {
  const raw = fs.readFileSync(configPath);
  return JSON.parse(raw);
});
