// server.js - El robot que controla el navegador (Versión 2.0, robusta)

const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para aceptar JSON y para CORS
app.use(express.json());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    // Manejar la petición pre-flight OPTIONS
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.post('/api/beta10', async (req, res) => {
    console.log("Petición recibida para /api/beta10");
    const { action, point, location } = req.body;

    if (!action || !point || !location) {
        return res.status(400).json({ success: false, error: 'Faltan datos en la petición.' });
    }

    let browser = null;
    try {
        console.log('Lanzando navegador headless...');
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--single-process'
            ],
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
            timeout: 60000,
        });

        const page = await browser.newPage();
        page.setDefaultNavigationTimeout(60000); // Timeout de 60s para todas las navegaciones
        const BASE_URL = 'https://9teknic.movilidadbeta10.es:9001';

        // 1. Ir a la página de login
        console.log('Paso 1: Navegando a la página de login.');
        await page.goto(BASE_URL + '/');

        // 2. Hacer login
        console.log('Paso 2: Rellenando credenciales y haciendo login.');
        await page.waitForSelector('#id_username', { visible: true });
        await page.type('#id_username', process.env.BETA10_USER);

        await page.waitForSelector('#id_password', { visible: true });
        await page.type('#id_password', process.env.BETA10_PASS);

        await page.waitForSelector('button[type="submit"]', { visible: true });
        await Promise.all([
            page.click('button[type="submit"]'),
            page.waitForNavigation()
        ]);

        if (!page.url().includes('/inicio/')) {
            throw new Error(`Login fallido. URL final: ${page.url()}`);
        }
        console.log('Login exitoso.');

        // 3. Ir a la página de la acción
        const presenciaUrl = `${BASE_URL}/presencia/${action}/`;
        console.log(`Paso 3: Navegando a ${presenciaUrl}`);
        await page.goto(presenciaUrl);

        // 4. Rellenar el formulario de fichaje
        console.log('Paso 4: Rellenando datos del fichaje.');
        await page.waitForSelector('#id_punto_acceso', { visible: true });
        await page.type('#id_punto_acceso', point);

        const obsText = `GPS: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)} (±${Math.round(location.accuracy)}m) - App Control Jornada`;
        await page.waitForSelector('#id_observaciones', { visible: true });
        await page.type('#id_observaciones', obsText);

        await page.evaluate((lat, lon, acc, time) => {
            document.querySelector('#id_latitude').value = lat;
            document.querySelector('#id_longitude').value = lon;
            document.querySelector('#id_accuracy').value = acc;
            document.querySelector('#id_timestamp').value = time;
        }, location.latitude.toString(), location.longitude.toString(), location.accuracy.toString(), location.timestamp);

        // 5. Enviar el formulario
        console.log('Paso 5: Enviando el fichaje...');
        await page.waitForSelector('a.boton.aceptar', { visible: true });
        await Promise.all([
            page.click('a.boton.aceptar'),
            page.waitForNavigation()
        ]);

        if (!page.url().includes('/presencia/')) {
            throw new Error('El fichaje falló. No se redirigió a la lista de presencia.');
        }

        console.log('¡Fichaje realizado con éxito!');
        res.status(200).json({ success: true });

    } catch (error) {
        console.error('Error en el proceso de Puppeteer:', error.message);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        if (browser) {
            console.log('Cerrando el navegador.');
            await browser.close();
        }
    }
});

app.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});
