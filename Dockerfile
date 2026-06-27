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
# Railway fournit PORT (8080) ; `next start` le lit automatiquement
EXPOSE 8080

CMD ["npm", "start"]
