// server.js - VERSIÓN FINAL - Usando Cookie de Sesión

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
            executablePath: '/opt/google/chrome/google-chrome' // Usamos la ruta que descubrimos que era la correcta
        });

        const page = await browser.newPage();
        const BASE_URL = 'https://9teknic.movilidadbeta10.es:9001';

        // --- ESTRATEGIA DE COOKIE ---
        // 1. Inyectar la cookie de sesión que hemos guardado en las variables de entorno.
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
        
        // 2. Ir DIRECTAMENTE a la página de la acción. Ya no hacemos login.
        const presenciaUrl = `${BASE_URL}/presencia/${action}/`;
        console.log(`Paso 2: Navegando a ${presenciaUrl} con la sesión activa.`);
        await page.goto(presenciaUrl, { waitUntil: 'networkidle2' });

        // Verificar que no nos ha redirigido a la página de login
        if (page.url().includes('login')) {
            throw new Error('La cookie de sesión ha caducado o es inválida. Inicia sesión de nuevo y actualiza la cookie en Render.');
        }
        console.log('Navegación exitosa, la sesión es válida.');

        // 3. Rellenar el formulario de fichaje
        console.log('Paso 3: Rellenando datos del fichaje.');
        await page.waitForSelector('#id_punto_acceso', { visible: true, timeout: 15000 });
        await page.type('#id_punto_acceso', point);

        const obsText = `GPS: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)} (±${Math.round(location.accuracy)}m) - App Control Jornada`;
        await page.waitForSelector('#id_observaciones', { visible: true, timeout: 15000 });
        await page.type('#id_observaciones', obsText);
        
        await page.evaluate((lat, lon, acc, time) => {
            document.querySelector('#id_latitude').value = lat;
            document.querySelector('#id_longitude').value = lon;
            document.querySelector('#id_accuracy').value = acc;
            document.querySelector('#id_timestamp').value = time;
        }, location.latitude.toString(), location.longitude.toString(), location.accuracy.toString(), location.timestamp);
        
        // 4. Enviar el formulario
        console.log('Paso 4: Enviando el fichaje...');
        await page.waitForSelector('a.boton.aceptar', { visible: true, timeout: 15000 });
        await Promise.all([
            page.click('a.boton.aceptar'),
            page.waitForNavigation({ waitUntil: 'networkidle2' })
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
