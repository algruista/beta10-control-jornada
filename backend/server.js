// server.js - VERSIÓN FINAL v2 - Esperando el diálogo de confirmación

const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    if (req.method === 'OPTIONS') { return res.sendStatus(200); }
    next();
});

app.post('/api/beta10', async (req, res) => {
    console.log("Petición recibida para /api/beta10 con estrategia de cookie.");
    const { action, point, location } = req.body;

    if (!action || !point || !location) {
        return res.status(400).json({ success: false, error: 'Faltan datos.' });
    }

    let browser = null;
    try {
        console.log('Lanzando navegador headless...');
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            executablePath: '/opt/google/chrome/google-chrome'
        });

        const page = await browser.newPage();
        const BASE_URL = 'https://9teknic.movilidadbeta10.es:9001';

        console.log('Paso 1: Inyectando cookie de sesión.');
        const sessionCookie = {
            name: 'sessionid',
            value: process.env.BETA10_SESSION_COOKIE,
            domain: '9teknic.movilidadbeta10.es',
            path: '/',
            httpOnly: true,
            secure: true
        };
        await page.setCookie(sessionCookie);
        
        const presenciaUrl = `${BASE_URL}/presencia/${action}/`;
        console.log(`Paso 2: Navegando a ${presenciaUrl} con la sesión activa.`);
        await page.goto(presenciaUrl, { waitUntil: 'networkidle2' });

        if (page.url().includes('login')) {
            throw new Error('La cookie de sesión ha caducado o es inválida.');
        }
        console.log('Navegación exitosa, la sesión es válida.');
        
        // --------------------------------------------------------------------
        // ¡NUEVO PASO AÑADIDO! Esperar a que la ventana de diálogo aparezca.
        // --------------------------------------------------------------------
        console.log('Paso 3: Esperando el diálogo de confirmación...');
        await page.waitForSelector('dialog[open]', { visible: true, timeout: 15000 });
        console.log('Diálogo encontrado. Rellenando datos del fichaje.');

        // 3. Rellenar el formulario de fichaje (ahora Paso 4)
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
        
        // 4. Enviar el formulario (ahora Paso 5)
        console.log('Paso 5: Enviando el fichaje...');
        await page.waitForSelector('a.boton.aceptar', { visible: true });
        await Promise.all([
            page.click('a.boton.aceptar'),
            page.waitForNavigation({ waitUntil: 'networkidle2' })
        ]);

        if (!page.url().includes('/presencia/')) {
            throw new Error('El fichaje falló. No se redirigió a la lista de presencia.');
        }

        console.log('¡¡¡FICHAJE REALIZADO CON ÉXITO!!!');
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
