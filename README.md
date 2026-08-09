# ✒️ Encre — Caviardage & Floutage d'Images 100% Local

> Application web PWA ultra-rapide pour caviarder, flouter et pixeliser des images en toute confidentialité, directement sur smartphone et ordinateur. **Aucune donnée ne quitte votre appareil.**

[![Vercel Live Demo](https://img.shields.io/badge/Vercel-Live_Demo-000000?style=for-the-badge&logo=vercel)](https://encre-blond.vercel.app)
[![PWA Ready](https://img.shields.io/badge/PWA-100%25_Offline-5A0FC8?style=for-the-badge&logo=pwa)](https://encre-blond.vercel.app)
[![License](https://img.shields.io/badge/License-MIT-blue.style=for-the-badge)](#license)

---

## 📱 Installation Directe sur Smartphone (Sans APK)

Encre est une **Progressive Web App (PWA)** complète qui s'installe en un clic et s'exécute comme une application native 100% hors-ligne.

### Sur Android (Chrome / Brave / Edge)
1. Ouvrez **[https://encre-blond.vercel.app](https://encre-blond.vercel.app)** dans votre navigateur.
2. Cliquez sur le bouton **« Installer »** dans l'en-tête de la page.
3. L'application apparaît sur votre écran d'accueil.

### Sur iPhone / iPad (iOS Safari)
1. Ouvrez **[https://encre-blond.vercel.app](https://encre-blond.vercel.app)** dans Safari.
2. Appuyez sur le bouton **Partager** (icône carré avec flèche vers le haut).
3. Sélectionnez **« Sur l'écran d'accueil »** puis appuyez sur **« Ajouter »**.

---

## ✨ Fonctionnalités Principales

- 🔒 **100% Confidentiel & Hors-ligne** : Vos photos restent sur votre appareil et ne sont jamais transmises à un serveur.
- 📲 **Integration Partage Système (Web Share Target API)** : Partagez une photo directement depuis la galerie ou vos messages vers Encre.
- 🔲 **Formes Interactives (Déplacement & Redimensionnement)** : Positionnez et ajustez la taille de vos zones de masquage au pixel près avec 8 poignées tactiles.
- 🔍 **Gestes Multi-Touch (Pinch-to-zoom & Pan)** : Zoomez avec deux doigts pour travailler précisément sur du texte petit ou des détails.
- 🛠️ **Boîte à Outils Complète** :
  - **Outils** : Rectangle, Oval / Cercle, Lasso libre, Pinceau.
  - **Modes** : Caviardage (masquage couleur), Flou gaussien (intensité réglable), Pixelisation (taille de blocs réglable).
  - **Gestion de l'historique** : Annulation (`Ctrl+Z`), Rétablissement (`Ctrl+Y`), Réinitialisation.
  - **Aperçu Avant / Après** : Maintenez le bouton d'aperçu pour comparer instantanément avec l'original.
- 💾 **Exportation Personnalisable** : Format PNG ou JPEG (avec choix de la qualité), export individuel ou par lot.
- 🌓 **Thème Sombre / Clair** : Interface adaptable et soignée.

---

## ⌨️ Raccourcis Clavier

| Raccourcis | Action |
| :--- | :--- |
| `M` / `H` | Outil Main / Déplacer la vue |
| `R` | Sélection Rectangle |
| `O` | Sélection Oval |
| `L` | Lasso libre |
| `B` | Pinceau |
| `Ctrl` + `Z` / `Cmd` + `Z` | Annuler |
| `Ctrl` + `Y` / `Cmd` + `Z` + `Shift` | Rétablir |
| `Entrée` | Valider la forme interactive |
| `Échap` | Annuler la forme interactive |
| `+` / `-` | Zoom Avant / Zoom Arrière |
| `Ctrl` + `V` / `Cmd` + `V` | Coller une image depuis le presse-papier |

---

## 💻 Développement Local

```bash
# Clonez le dépôt
git clone https://github.com/fnnktkygl-code/encre.git
cd encre

# Installez les dépendances
npm install

# Lancez le serveur de développement
npm run dev

# Compilez pour la production
npm run build
```

---

## 🛠️ Stack Technique

- **Bundler** : [Vite](https://vitejs.dev/)
- **Core Engine** : HTML5 Canvas & HTML5 Web APIs, Vanilla JavaScript ES2020
- **Styling** : Vanilla CSS3 avec Custom Properties (Variables)
- **Offline & PWA** : Service Worker (`sw.js`), Web App Manifest (`manifest.json`)
- **Déploiement** : [Vercel](https://vercel.com/)

---

## 📄 Licence

MIT License © 2026 Encre
