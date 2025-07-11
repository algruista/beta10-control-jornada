// server.js - VERSIÓN FINAL CORREGIDA CON LOS SELECTORES REALES

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
    console.log("Petición recibida para /api/beta10.");
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
            executablePath: '/usr/bin/google-chrome-stable'
        });

        const page = await browser.newPage();
        const BASE_URL = 'https://9teknic.movilidadbeta10.es:9001';
        
        const presenciaUrl = `${BASE_URL}/presencia/${action}/`;
        console.log(`Paso 1: Navegando a ${presenciaUrl}`);
        await page.goto(presenciaUrl, { waitUntil: 'networkidle2' });

        const isLoginPage = await page.$('#id_username');
        if (isLoginPage) {
            console.log('Paso 2: Detectado formulario de login. Haciendo login...');
            await page.type('#id_username', process.env.BETA10_USER);
            await page.type('#id_password', process.env.BETA10_PASS);
            await Promise.all([
                page.click('button[type="submit"]'),
                page.waitForNavigation({ waitUntil: 'networkidle2' })
            ]);
            await page.goto(presenciaUrl, { waitUntil: 'networkidle2' });
        }
        
        console.log('Navegación exitosa, sesión válida.');
        console.log('Paso 3: Esperando el diálogo de confirmación...');
        await page.waitForSelector('div[role="dialog"]', { visible: true, timeout: 15000 });
        console.log('Diálogo encontrado. Rellenando datos del fichaje...');

        // =================================================================
        // ¡¡CORRECCIONES FINALES APLICADAS!!
        // =================================================================
        const puntoAccesoSelector = `#id_punto_${action}`;
        const observacionesSelector = `#id_observaciones_${action}`;
        const submitSelector = '#submit-presencia';
        
        console.log(`Paso 4: Rellenando campos con selectores: ${puntoAccesoSelector}, ${observacionesSelector}`);
        
        await page.waitForSelector(puntoAccesoSelector, { visible: true });
        await page.type(puntoAccesoSelector, point);

        const obsText = `GPS: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)} (±${Math.round(location.accuracy)}m) - App Control Jornada`;
        await page.waitForSelector(observacionesSelector, { visible: true });
        await page.type(observacionesSelector, obsText);
        
        // Estos campos ocultos parecen usar "entrada" o "salida" también
        await page.evaluate((lat, lon, acc, time, action) => {
            document.querySelector(`#id_latitud_${action}`).value = lat;
            document.querySelector(`#id_longitud_${action}`).value = lon;
            // Nota: No hay campos de accuracy o timestamp en el HTML del diálogo, los omitimos para evitar errores.
        }, location.latitude.toString(), location.longitude.toString(), location.accuracy.toString(), location.timestamp, action);
        
        console.log('Paso 5: Enviando el fichaje...');
        await page.waitForSelector(submitSelector, { visible: true });
        await Promise.all([
            page.click(submitSelector),
            page.waitForNavigation({ waitUntil: 'networkidle2' })
        ]);

        if (!page.url().includes('/presencia/')) {
            throw new Error(`El fichaje falló. No se redirigió a la lista de presencia. URL final: ${page.url()}`);
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
