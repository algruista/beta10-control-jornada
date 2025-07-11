// server.js - VERSIÓN FINAL v3 - Con login automático

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
    console.log("Petición recibida para /api/beta10 con login automático.");
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
        
        const presenciaUrl = `${BASE_URL}/presencia/${action}/`;
        console.log(`Paso 1: Navegando a ${presenciaUrl}`);
        await page.goto(presenciaUrl, { waitUntil: 'networkidle2' });

        // Verificar si estamos en la página de login
        const isLoginPage = await page.$('#username');
        if (isLoginPage) {
            console.log('Paso 2: Detectado formulario de login. Haciendo login automático...');
            
            // Rellenar credenciales
            await page.type('#username', process.env.BETA10_USERNAME);
            await page.type('#password', process.env.BETA10_PASSWORD);
            
            // Hacer click en "Entrar" y esperar navegación
            await Promise.all([
                page.click('input[type="submit"]'),
                page.waitForNavigation({ waitUntil: 'networkidle2' })
            ]);
            
            console.log('Login completado. Navegando a la página de entrada...');
            
            // Navegar de nuevo a la página de entrada
            await page.goto(presenciaUrl, { waitUntil: 'networkidle2' });
        }

        console.log('Navegación exitosa, sesión válida.');
        
        // Verificar que estamos en la página correcta
        console.log('Paso 3: Esperando el diálogo de confirmación...');
        
        // Buscar el diálogo - probamos diferentes selectores
        let dialogFound = false;
        const selectors = ['dialog', 'div[role="dialog"]', '.ui-dialog', '[data-role="dialog"]'];
        
        for (const selector of selectors) {
            try {
                await page.waitForSelector(selector, { visible: true, timeout: 3000 });
                console.log(`Diálogo encontrado con selector: ${selector}`);
                dialogFound = true;
                break;
            } catch (e) {
                console.log(`No se encontró diálogo con selector: ${selector}`);
            }
        }
        
        if (!dialogFound) {
            // Si no encontramos diálogo, capturar debug info
            await page.screenshot({path: 'debug.png'});
            const pageContent = await page.content();
            console.log('DEBUG - Contenido de la página:', pageContent.substring(0, 1000) + '...');
            throw new Error('No se pudo encontrar el diálogo de confirmación');
        }

        console.log('Paso 4: Rellenando datos del fichaje...');

        // Rellenar el formulario de fichaje
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
        
        // Enviar el formulario
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
