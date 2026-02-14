const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { Client, Authenticator } = require("minecraft-launcher-core");
const launcher = new Client();

/* ===============================
   CONFIG & CHEMINS
   =============================== */
// On utilise path.resolve pour être sûr d'avoir des strings propres
const gameDir = path.resolve(os.homedir(), "AppData/Roaming/.arcendmc");
const javaPath = path.resolve(__dirname, "../runtime/java-21/bin/java.exe");
const configPath = path.resolve(__dirname, "../config/app.json");

function createWindow() {
    const win = new BrowserWindow({
        width: 1000,
        height: 650,
        resizable: false,
        backgroundColor: "#0E0E11",
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, "preload.js")
        }
    });

    win.loadFile(path.join(__dirname, "../app/index.html"));
}

app.whenReady().then(createWindow);

/* ===============================
   LOGIQUE DE LANCEMENT
   =============================== */
ipcMain.on("play", async (event) => {
    console.log("=== ARCEND MC PLAY ===");

    // Chargement de la config RAM
    let ramAmount = "4"; 
    try {
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
            ramAmount = config.ram || "4";
        }
    } catch (e) {
        console.log("[Config] Erreur lecture config, utilisation 4G par défaut");
    }

    // On définit le chemin de l'installeur en haut
    const installerPath = path.resolve(__dirname, "../assets/neoforge-21.1.218-installer.jar");

    // Préparation des options pour MCLC
    const opts = {
        authorization: Authenticator.getAuth("ArcendPlayer"),
        root: gameDir,
        javaPath: javaPath, // Chemin vers ton Java 21
        version: {
            number: "1.21.1",
            type: "release"
        },
        // Configuration spécifique pour NeoForge
        forge: installerPath,

        memory: {
            max: `${ramAmount}G`,
            min: "2G"
        }
    };

    console.log("[Launcher] Lancement du processus NeoForge...");

    // Lancement
    launcher.launch(opts);

    /* --- ÉVÉNEMENTS --- */
    launcher.on("debug", (e) => console.log("[DEBUG]", e));
    
    launcher.on("data", (e) => {
        // Nettoyage des logs Minecraft pour la console
        console.log("[MC]", e.trim());
    });

    launcher.on("progress", (e) => {
        // Envoie la progression à ton interface (pour une barre de chargement)
        if (event.sender && !event.sender.isDestroyed()) {
            event.sender.send("download-progress", e);
        }
    });

    launcher.on("close", (code) => {
        console.log("[Launcher] Le jeu s'est arrêté (Code: " + code + ")");
    });

    launcher.on("error", (err) => {
        console.error("[Launcher Error] Erreur critique :", err);
    });
});

/* ===============================
   GESTION CONFIG RAM
   =============================== */
ipcMain.handle("get-config", () => {
    if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, "utf8"));
    }
    return { ram: 4 };
});

ipcMain.on("set-ram", (_, value) => {
    const config = fs.existsSync(configPath) 
        ? JSON.parse(fs.readFileSync(configPath, "utf8")) 
        : {};
    config.ram = value;
    if (!fs.existsSync(path.dirname(configPath))) {
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
});