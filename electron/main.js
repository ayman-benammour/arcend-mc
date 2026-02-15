const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const axios = require("axios");
const AdmZip = require("adm-zip");
const { Client } = require("minecraft-launcher-core");
const { Auth } = require("msmc");

const launcher = new Client();

/* ==========================================================
    1. CONFIGURATION DES CHEMINS & URLS
   ========================================================== */
// Dossier où le jeu sera installé (AppData/Roaming/.arcendmc)
const gameDir = path.resolve(os.homedir(), "AppData/Roaming/.arcendmc");
// Chemin vers ton Java 21 intégré au launcher
const javaPath = path.resolve(__dirname, "../runtime/java-21/bin/java.exe");
// Fichier de config locale pour stocker la RAM et la version actuelle
const configPath = path.resolve(__dirname, "../config/app.json"); 
// Installateur NeoForge (doit être dans tes assets)
const forgeInstaller = path.resolve(__dirname, "../assets/neoforge-21.1.218-installer.jar");

// URL de ton fichier version.json sur ton VPS OVH
const VERSION_URL = "http://51.89.138.186/version.json";

// Création du dossier de jeu s'il n'existe pas
if (!fs.existsSync(gameDir)) fs.mkdirSync(gameDir, { recursive: true });

/* ==========================================================
    2. GESTION DE LA FENÊTRE PRINCIPALE (ELECTRON)
   ========================================================== */
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

/* ==========================================================
    3. FONCTIONS DE TÉLÉCHARGEMENT ET NETTOYAGE
   ========================================================== */

// Télécharge un fichier depuis une URL avec suivi de progression
async function downloadFile(url, destPath, event, taskName) {
    const response = await axios({ method: 'get', url: url, responseType: 'stream' });
    const totalLength = response.headers['content-length'];

    return new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(destPath);
        let downloadedLength = 0;

        response.data.on('data', (chunk) => {
            downloadedLength += chunk.length;
            const progress = Math.round((downloadedLength / totalLength) * 100);
            // Envoie le pourcentage à l'interface HTML/JS
            event.sender.send("download-progress", { type: "BASE", task: taskName, total: progress });
        });

        response.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

// Nettoie le dossier de jeu mais protège les fichiers perso du joueur
function smartClean(excludedFiles) {
    if (!fs.existsSync(gameDir)) return;
    const items = fs.readdirSync(gameDir);
    items.forEach(item => {
        // Supprime tout sauf les fichiers exclus (saves, options, etc.)
        if (!excludedFiles.includes(item) && !item.startsWith('.')) {
            const fullPath = path.join(gameDir, item);
            try {
                fs.rmSync(fullPath, { recursive: true, force: true });
            } catch (e) { console.log(`[Arcend] Impossible de supprimer ${item}`); }
        }
    });
}

// Vérifie si une mise à jour est dispo sur le VPS et l'installe
async function handleUpdates(event) {
    try {
        console.log("[Arcend] Vérification de la version...");
        const response = await axios.get(VERSION_URL);
        const remote = response.data; // Récupère arcend_version et arcend_url

        // Lecture de la config locale (version installée sur le PC)
        let appConfig = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf8")) : {};
        
        // Comparaison des versions (ex: 0.1.0 vs 0.1.1)
        if (appConfig.version !== remote.arcend_version) {
            console.log("[Arcend] Mise à jour détectée. Nettoyage et installation...");
            
            // On protège les dossiers précieux du joueur avant de supprimer les vieux mods
            smartClean(['options.txt', 'servers.dat', 'saves', 'screenshots', 'resourcepacks', 'shaderpacks']);
            
            const zipPath = path.join(gameDir, "update_temp.zip");
            // Télécharge le pack global arcend.zip depuis ton VPS
            await downloadFile(remote.arcend_url, zipPath, event, "Mise à jour d'Arcend");
            
            // Extraction du ZIP dans le dossier de jeu
            const zip = new AdmZip(zipPath);
            zip.extractAllTo(gameDir, true);
            fs.unlinkSync(zipPath); // Supprime le ZIP temporaire
            
            // Sauvegarde du nouveau numéro de version localement
            appConfig.version = remote.arcend_version;
            fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 2));
            console.log("[Arcend] Mise à jour terminée avec succès !");
        }

    } catch (err) {
        console.error("[Arcend] Erreur lors de la synchronisation :", err.message);
    }
}

/* ==========================================================
    4. LOGIQUE DE LANCEMENT DU JEU
   ========================================================== */
ipcMain.on("play", async (event) => {
    try {
        // Authentification Microsoft / Xbox
        const authManager = new Auth("select_account");
        const xbox = await authManager.launch("electron");
        const mc = await xbox.getMinecraft();

        if (!mc || !mc.profile) return;

        // Étape de mise à jour automatique avant de lancer
        await handleUpdates(event);

        // Récupération de la RAM dans la config (8 Go par défaut)
        let ramAmount = "8";
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
            ramAmount = config.ram || "8";
        }

        // Options de lancement pour Minecraft-Launcher-Core
        const opts = {
            authorization: mc.mclc(),
            root: gameDir,
            javaPath: javaPath,
            version: { number: "1.21.1", type: "release" }, // Version de MC cible
            forge: forgeInstaller,
            memory: { max: `${ramAmount}G`, min: "2G" },
            overrides: { detached: false }
        };

        console.log("[Arcend] Lancement du jeu...");
        launcher.launch(opts);

        // Gestion des événements du jeu (progression, logs, fermeture)
        launcher.on("progress", (e) => event.sender.send("download-progress", e));
        launcher.on("data", (e) => console.log("[MC]", e.trim()));
        launcher.on("open", () => event.sender.send("game-launched"));
        launcher.on("close", () => event.sender.send("game-closed"));

    } catch (err) {
        console.error("[Arcend] Erreur Fatale au lancement :", err);
    }
});

/* ==========================================================
    5. PARAMÈTRES (RAM)
   ========================================================== */
ipcMain.handle("get-config", () => {
    if (fs.existsSync(configPath)) return JSON.parse(fs.readFileSync(configPath, "utf8"));
    return { ram: 8 };
});

ipcMain.on("set-ram", (_, value) => {
    let config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf8")) : {};
    config.ram = value;
    if (!fs.existsSync(path.dirname(configPath))) fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
});