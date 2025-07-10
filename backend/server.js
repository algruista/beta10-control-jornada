// server.js - El robot que controla el navegador

const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para aceptar JSON y para CORS
app.use(express.json());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Endpoint principal que la app llamará
app.post('/api/beta10', async (req, res) => {
    console.log("Petición recibida para /api/beta10");
    const { action, point, location } = req.body;
    
    // Validar que tenemos los datos necesarios
    if (!action || !point || !location) {
        return res.status(400).json({ success: false, error: 'Faltan datos en la petición.' });
    }

    let browser = null;
    try {
        console.log('Lanzando navegador headless...');
        // Opciones especiales para funcionar en servidores como Render
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process'
            ],
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
        });

        const page = await browser.newPage();
        const BASE_URL = 'https://9teknic.movilidadbeta10.es:9001';

        // --- INICIO DE LA AUTOMATIZACIÓN ---

        // 1. Ir a la página de login
        console.log('Paso 1: Navegando a la página de login.');
        await page.goto(BASE_URL + '/', { waitUntil: 'networkidle2' });

        // 2. Hacer login
        console.log('Paso 2: Rellenando credenciales y haciendo login.');
        await page.type('#id_username', process.env.BETA10_USER);
        await page.type('#id_password', process.env.BETA10_PASS);
        await Promise.all([
            page.click('button[type="submit"]'),
            page.waitForNavigation({ waitUntil: 'networkidle2' })
        ]);

        // Verificar que el login fue exitoso (hemos llegado a /inicio/)
        if (!page.url().includes('/inicio/')) {
            throw new Error('Login fallido. La URL no es la de /inicio/');
        }
        console.log('Login exitoso.');

        // 3. Ir a la página de la acción (entrada/salida)
        const presenciaUrl = `${BASE_URL}/presencia/${action}/`;
        console.log(`Paso 3: Navegando a ${presenciaUrl}`);
        await page.goto(presenciaUrl, { waitUntil: 'networkidle2' });

        // 4. Rellenar el formulario de fichaje
        console.log('Paso 4: Rellenando datos del fichaje.');
        await page.waitForSelector('#id_punto_acceso');
        await page.type('#id_punto_acceso', point);

        const obsText = `GPS: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)} (±${Math.round(location.accuracy)}m) - App Control Jornada`;
        await page.type('#id_observaciones', obsText);
        
        // El JavaScript de Beta10 necesita que estos campos ocultos también se rellenen
        await page.evaluate((lat, lon, acc, time) => {
            document.querySelector('#id_latitude').value = lat;
            document.querySelector('#id_longitude').value = lon;
            document.querySelector('#id_accuracy').value = acc;
            document.querySelector('#id_timestamp').value = time;
        }, location.latitude.toString(), location.longitude.toString(), location.accuracy.toString(), location.timestamp);
        
        // 5. Enviar el formulario
        console.log('Paso 5: Enviando el fichaje...');
        await Promise.all([
            // En la web de Beta10, el botón de aceptar está dentro de un `<a>`
            page.click('a.boton.aceptar'),
            page.waitForNavigation({ waitUntil: 'networkidle2' })
        ]);
        
        // 6. Verificar el éxito
        // Un fichaje exitoso te redirige a la lista de presencia
        if (!page.url().includes('/presencia/')) {
            throw new Error('El fichaje falló. No se redirigió a la lista de presencia.');
        }

        console.log('¡Fichaje realizado con éxito!');
        await browser.close();
        res.status(200).json({ success: true });

    } catch (error) {
        console.error('Error en el proceso de Puppeteer:', error.message);
        if (browser) {
            await browser.close();
        }
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});
