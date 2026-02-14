const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const axios = require("axios");
const AdmZip = require("adm-zip");
const { Client } = require("minecraft-launcher-core");
const { Auth } = require("msmc");
const launcher = new Client();

/* ===============================
   CONFIG & CHEMINS
   =============================== */
const gameDir = path.resolve(os.homedir(), "AppData/Roaming/.arcendmc");
const javaPath = path.resolve(__dirname, "../runtime/java-21/bin/java.exe");
const configPath = path.resolve(__dirname, "../config/app.json");
const forgeInstaller = path.resolve(__dirname, "../assets/neoforge-21.1.218-installer.jar");

// Liens de ton contenu (À remplir plus tard avec tes liens GitHub Releases ou VPS)
const CONFIG_ZIP_URL = "https://ton-lien-direct.com/config.zip"; 

if (!fs.existsSync(gameDir)) fs.mkdirSync(gameDir, { recursive: true });

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
   FONCTION DE SYNCHRONISATION
   =============================== */
async function syncArcendContent(event) {
    try {
        console.log("[Sync] Vérification des configurations...");
        event.sender.send("download-progress", { type: "Initialisation", task: 0, total: 100 });

        const zipPath = path.join(gameDir, "temp_config.zip");

        // Téléchargement du ZIP de config
        const response = await axios({ method: 'get', url: CONFIG_ZIP_URL, responseType: 'stream' });
        
        const writer = fs.createWriteStream(zipPath);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        console.log("[Sync] Extraction des fichiers...");
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(gameDir, true); // Écrase les anciennes configs
        
        fs.unlinkSync(zipPath); // Nettoyage
        console.log("[Sync] Terminé !");
        
    } catch (err) {
        // On log l'erreur mais on ne bloque pas le jeu si le serveur est hors-ligne
        console.log("[Sync] Serveur de contenu non joignable, lancement classique.");
    }
}

/* ===============================
   LOGIQUE DE LANCEMENT
   =============================== */
ipcMain.on("play", async (event) => {
    try {
        // 1. Authentification Microsoft
        const authManager = new Auth("select_account");
        const xbox = await authManager.launch("electron");
        const mc = await xbox.getMinecraft();

        if (!mc || !mc.profile) return;

        // 2. Synchronisation du contenu (Mods customs & Configs)
        // Note: Tu peux commenter cette ligne tant que tu n'as pas de lien URL valide
        // await syncArcendContent(event);

        // 3. Récupération de la RAM
        let ramAmount = "8";
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
            ramAmount = config.ram || "8";
        }

        // 4. Options de lancement
        const opts = {
            authorization: mc.mclc(),
            root: gameDir,
            javaPath: javaPath,
            version: { number: "1.21.1", type: "release" },
            forge: forgeInstaller,
            memory: { max: `${ramAmount}G`, min: "2G" }
        };

        console.log("[Launcher] Lancement...");
        launcher.launch(opts);

        launcher.on("progress", (e) => event.sender.send("download-progress", e));
        launcher.on("data", (e) => console.log("[MC]", e.trim()));

    } catch (err) {
        console.error("[Erreur]", err);
    }
});

// Handlers RAM (Gardés de ta version précédente)
ipcMain.handle("get-config", () => {
    if (fs.existsSync(configPath)) return JSON.parse(fs.readFileSync(configPath, "utf8"));
    return { ram: 8 };
});

ipcMain.on("set-ram", (_, value) => {
    let config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf8")) : {};
    config.ram = value;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
});