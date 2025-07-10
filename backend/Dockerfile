# Dockerfile - VERSIÓN DETECTIVE
# Propósito: Encontrar la ruta real de instalación de Google Chrome.

FROM node:18-bullseye

# PASO 1: Instalar Google Chrome (igual que antes)
RUN apt-get update \
    && apt-get install -y wget gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# -----------------------------------------------------------------
# ¡PASOS DE INVESTIGACIÓN!
# Estos comandos se ejecutarán durante el build y nos darán la respuesta en los logs.
# -----------------------------------------------------------------

# INVESTIGACIÓN 1: Listar el contenido de los directorios de binarios más comunes buscando "chrome".
RUN echo "====== INVESTIGANDO /usr/bin/ ======" && ls -la /usr/bin/ | grep chrome || echo "No se encontró 'chrome' en /usr/bin/"
RUN echo "====== INVESTIGANDO /opt/ ======" && ls -laR /opt/ | grep chrome || echo "No se encontró 'chrome' en /opt/"

# INVESTIGACIÓN 2 (LA MÁS IMPORTANTE): Usar el comando 'which' para que el sistema nos diga la ruta del ejecutable.
RUN echo "====== BUSCANDO CON 'which' ======" && which google-chrome-stable || echo "COMANDO 'which' NO ENCONTRÓ google-chrome-stable"

# -----------------------------------------------------------------
# El resto del Dockerfile continúa normalmente.
# -----------------------------------------------------------------

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 10000
CMD [ "node", "server.js" ]
