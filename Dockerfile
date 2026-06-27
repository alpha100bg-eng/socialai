# Image officielle Playwright : Chromium + toutes les bibliothèques système
# (libglib, libnss, etc.) déjà installées. Résout l'erreur
# "libglib-2.0.so.0: cannot open shared object file" sur Railway.
FROM mcr.microsoft.com/playwright:v1.60.0-noble

WORKDIR /app

# Dépendances (postinstall télécharge Chromium ; les libs système sont déjà là)
COPY package.json package-lock.json ./
RUN npm ci

# Code source + build de production Next.js
COPY . .
RUN npm run build

ENV NODE_ENV=production
# Active le mode "avec écran" (Chromium non-headless) sous écran virtuel Xvfb
ENV HEADFUL_XVFB=1
# Railway fournit PORT (8080) ; `next start` le lit automatiquement
EXPOSE 8080

# xvfb-run fournit un écran virtuel pour Chromium (plus stable que headless
# sur TikTok). xvfb est inclus dans l'image officielle Playwright.
CMD ["xvfb-run", "-a", "--server-args=-screen 0 1280x1024x24", "npm", "start"]
