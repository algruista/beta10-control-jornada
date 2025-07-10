# Usamos una imagen base de Node.js que ya incluye las herramientas para instalar Chrome
FROM node:18-slim

# Instalamos las dependencias necesarias para que Chrome funcione
RUN apt-get update && apt-get install -yq \
    gconf-service libasound2 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 \
    libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 \
    libgtk-3-0 libnspr4 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 \
    libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 \
    libxi6 libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates fonts-liberation \
    libappindicator1 libnss3 lsb-release xdg-utils wget

# Creamos el directorio de trabajo
WORKDIR /app

# Copiamos el package.json y package-lock.json para instalar dependencias
COPY package*.json ./

# Instalamos Puppeteer SIN descargar el navegador, porque lo instalaremos manualmente
RUN npm install --production

# Copiamos el resto del código de la aplicación
COPY . .

# Establecemos el usuario a 'node' para mayor seguridad
USER node

# Exponemos el puerto
EXPOSE 10000

# Comando para arrancar el servidor
CMD [ "node", "server.js" ]
