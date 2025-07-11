// server.js - VERSIÓN FINAL v5 - Sistema riguroso y completo

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
    console.log("=== INICIO DE PROCESO DE FICHAJE ===");
    console.log("Petición recibida para /api/beta10 con sistema riguroso.");
    
    const { action, point, location } = req.body;

    // Validación exhaustiva de datos
    if (!action || !point || !location) {
        console.error("ERROR: Faltan datos requeridos");
        return res.status(400).json({ success: false, error: 'Faltan datos requeridos.' });
    }

    if (!['entrada', 'salida'].includes(action)) {
        console.error("ERROR: Acción inválida:", action);
        return res.status(400).json({ success: false, error: 'Acción debe ser "entrada" o "salida".' });
    }

    if (!location.latitude || !location.longitude) {
        console.error("ERROR: Coordenadas GPS inválidas");
        return res.status(400).json({ success: false, error: 'Coordenadas GPS requeridas.' });
    }

    console.log(`Procesando ${action.toUpperCase()} para punto: ${point}`);
    console.log(`Coordenadas: ${location.latitude}, ${location.longitude} (±${location.accuracy}m)`);

    let browser = null;
    try {
        console.log('PASO 1: Lanzando navegador headless...');
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ],
            executablePath: '/opt/google/chrome/google-chrome'
        });

        const page = await browser.newPage();
        
        // Configurar página para mejor rendimiento
        await page.setViewport({ width: 1280, height: 720 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        
        const BASE_URL = 'https://9teknic.movilidadbeta10.es:9001';
        const presenciaUrl = `${BASE_URL}/presencia/${action}/`;
        
        console.log(`PASO 2: Navegando a ${presenciaUrl}`);
        await page.goto(presenciaUrl, { waitUntil: 'networkidle2', timeout: 30000 });

        // Verificar si necesitamos hacer login
        const isLoginPage = await page.$('#username');
        if (isLoginPage) {
            console.log('PASO 3: Detectado formulario de login. Iniciando autenticación...');
            
            if (!process.env.BETA10_USERNAME || !process.env.BETA10_PASSWORD) {
                throw new Error('Credenciales de login no configuradas en variables de entorno');
            }
            
            // Limpiar campos y rellenar credenciales
            await page.click('#username', { clickCount: 3 });
            await page.type('#username', process.env.BETA10_USERNAME, { delay: 50 });
            
            await page.click('#password', { clickCount: 3 });
            await page.type('#password', process.env.BETA10_PASSWORD, { delay: 50 });
            
            console.log('Enviando credenciales de login...');
            await Promise.all([
                page.click('input[type="submit"]'),
                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })
            ]);
            
            // Verificar que el login fue exitoso
            if (page.url().includes('login')) {
                throw new Error('Login falló - credenciales incorrectas o problema de autenticación');
            }
            
            console.log('Login exitoso. Navegando a la página de fichaje...');
            await page.goto(presenciaUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        }

        console.log('PASO 4: Sesión válida, buscando diálogo de confirmación...');
        
        // Buscar el diálogo con múltiples estrategias
        let dialogFound = false;
        const selectors = ['div[role="dialog"]', 'dialog', '.ui-dialog', '[data-role="dialog"]'];
        
        for (const selector of selectors) {
            try {
                await page.waitForSelector(selector, { visible: true, timeout: 5000 });
                console.log(`✓ Diálogo encontrado con selector: ${selector}`);
                dialogFound = true;
                break;
            } catch (e) {
                console.log(`✗ No se encontró diálogo con selector: ${selector}`);
            }
        }
        
        if (!dialogFound) {
            await page.screenshot({path: 'debug_no_dialog.png'});
            const pageContent = await page.content();
            console.error('DEBUG - Página actual:', pageContent.substring(0, 1000));
            throw new Error('No se pudo encontrar el diálogo de confirmación');
        }

        // Capturar y analizar el contenido del diálogo
        console.log('PASO 5: Analizando formulario de fichaje...');
        const dialogInfo = await page.evaluate((action) => {
            const dialog = document.querySelector('div[role="dialog"]');
            if (!dialog) return null;
            
            const titleElement = dialog.querySelector('h1, .ui-title');
            const title = titleElement ? titleElement.textContent.trim() : '';
            
            // Detectar campos según la acción
            const pointField = action === 'entrada' ? 
                dialog.querySelector('#id_punto_entrada') : 
                dialog.querySelector('#id_punto_salida');
                
            const obsField = action === 'entrada' ? 
                dialog.querySelector('#id_observaciones_entrada') : 
                dialog.querySelector('#id_observaciones_salida');
                
            const latField = action === 'entrada' ? 
                dialog.querySelector('#id_latitud_entrada') : 
                dialog.querySelector('#id_latitud_salida');
                
            const lonField = action === 'entrada' ? 
                dialog.querySelector('#id_longitud_entrada') : 
                dialog.querySelector('#id_longitud_salida');
            
            return {
                title,
                hasPointField: !!pointField,
                hasObsField: !!obsField,
                hasLatField: !!latField,
                hasLonField: !!lonField,
                pointFieldId: pointField ? pointField.id : null,
                obsFieldId: obsField ? obsField.id : null,
                latFieldId: latField ? latField.id : null,
                lonFieldId: lonField ? lonField.id : null
            };
        }, action);

        console.log('Información del diálogo:', dialogInfo);

        if (!dialogInfo || !dialogInfo.hasPointField) {
            throw new Error(`Formulario de ${action} no encontrado o incompleto`);
        }

        // Verificar que el diálogo corresponde a la acción correcta
        const expectedTitle = action === 'entrada' ? 'entrada' : 'salida';
        if (!dialogInfo.title.toLowerCase().includes(expectedTitle)) {
            throw new Error(`Diálogo incorrecto. Esperado: ${expectedTitle}, Encontrado: ${dialogInfo.title}`);
        }

        console.log('PASO 6: Rellenando formulario de fichaje...');

        // Rellenar punto de acceso
        const pointSelector = `#${dialogInfo.pointFieldId}`;
        await page.waitForSelector(pointSelector, { visible: true, timeout: 10000 });
        await page.click(pointSelector, { clickCount: 3 }); // Seleccionar todo
        await page.type(pointSelector, point, { delay: 50 });
        console.log(`✓ Punto de acceso rellenado: ${point}`);

        // Rellenar observaciones
        const obsText = `GPS: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)} (±${Math.round(location.accuracy || 0)}m) - App Control Jornada`;
        const obsSelector = `#${dialogInfo.obsFieldId}`;
        await page.waitForSelector(obsSelector, { visible: true, timeout: 10000 });
        await page.click(obsSelector, { clickCount: 3 });
        await page.type(obsSelector, obsText, { delay: 30 });
        console.log('✓ Observaciones rellenadas');

        // Rellenar coordenadas GPS en campos ocultos
        await page.evaluate((latFieldId, lonFieldId, lat, lon) => {
            const latField = document.getElementById(latFieldId);
            const lonField = document.getElementById(lonFieldId);
            if (latField) latField.value = lat;
            if (lonField) lonField.value = lon;
        }, dialogInfo.latFieldId, dialogInfo.lonFieldId, location.latitude.toString(), location.longitude.toString());
        console.log('✓ Coordenadas GPS configuradas');

        console.log('PASO 7: Enviando formulario...');

        // Tomar screenshot antes del envío
        await page.screenshot({path: 'before_submit.png'});

        // Enviar formulario y capturar respuesta
        await page.waitForSelector('#submit-presencia', { visible: true, timeout: 10000 });
        
        console.log('Haciendo click en Aceptar...');
        
        // Configurar listener para interceptar la respuesta
        let navigationPromise = null;
        
        try {
            // Intentar navegación normal primero
            navigationPromise = page.waitForNavigation({ 
                waitUntil: 'networkidle2', 
                timeout: 60000 
            });
            
            await page.click('#submit-presencia');
            await navigationPromise;
            
        } catch (navigationError) {
            console.log('Navegación no detectada, verificando estado de la página...');
            
            // Esperar un poco para que la página procese
            await page.waitForTimeout(3000);
        }

        // Verificar el resultado del envío
        console.log('PASO 8: Verificando resultado del fichaje...');
        
        const currentUrl = page.url();
        console.log('URL actual:', currentUrl);
        
        // Tomar screenshot después del envío
        await page.screenshot({path: 'after_submit.png'});

        // Verificar diferentes indicadores de éxito
        const verificationResult = await page.evaluate(() => {
            // Buscar mensajes de éxito
            const successIndicators = [
                document.querySelector('.message-success'),
                document.querySelector('.ui-collapsible'),
                document.querySelector('[class*="success"]'),
                document.querySelector('[class*="confirmacion"]')
            ].filter(el => el !== null);

            // Buscar mensajes de error
            const errorIndicators = [
                document.querySelector('.message-error'),
                document.querySelector('.alert-danger'),
                document.querySelector('[class*="error"]')
            ].filter(el => el !== null);

            // Verificar si aún estamos en el formulario
            const stillInForm = !!document.querySelector('#submit-presencia');

            return {
                hasSuccessIndicators: successIndicators.length > 0,
                hasErrorIndicators: errorIndicators.length > 0,
                stillInForm,
                pageTitle: document.title,
                successTexts: successIndicators.map(el => el.textContent?.trim()).filter(text => text),
                errorTexts: errorIndicators.map(el => el.textContent?.trim()).filter(text => text)
            };
        });

        console.log('Resultado de verificación:', verificationResult);

        // Lógica de verificación de éxito
        let fichajeSatisfactorio = false;
        let mensajeResultado = '';

        if (currentUrl.includes('/presencia/') && !currentUrl.includes(`/presencia/${action}/`)) {
            // Navegó fuera del formulario - probablemente exitoso
            fichajeSatisfactorio = true;
            mensajeResultado = 'Navegación exitosa fuera del formulario de fichaje';
        } else if (verificationResult.hasSuccessIndicators) {
            // Encontró indicadores de éxito
            fichajeSatisfactorio = true;
            mensajeResultado = `Indicadores de éxito encontrados: ${verificationResult.successTexts.join(', ')}`;
        } else if (verificationResult.hasErrorIndicators) {
            // Encontró errores específicos
            fichajeSatisfactorio = false;
            mensajeResultado = `Errores detectados: ${verificationResult.errorTexts.join(', ')}`;
        } else if (!verificationResult.stillInForm) {
            // Ya no está en el formulario
            fichajeSatisfactorio = true;
            mensajeResultado = 'Formulario enviado - ya no está presente en la página';
        } else {
            // Aún en el formulario - posible error
            fichajeSatisfactorio = false;
            mensajeResultado = 'El formulario sigue presente - posible error en el envío';
        }

        // Verificación adicional: intentar navegar a la lista de presencia
        console.log('PASO 9: Verificación final navegando a lista de presencia...');
        try {
            await page.goto(`${BASE_URL}/presencia/`, { waitUntil: 'networkidle2', timeout: 30000 });
            
            // Buscar el registro más reciente
            const recentRecord = await page.evaluate((action) => {
                const rows = document.querySelectorAll('table tbody tr, .listview li, .presencia-item');
                if (rows.length === 0) return null;
                
                const firstRow = rows[0];
                const text = firstRow.textContent?.toLowerCase() || '';
                const actionText = action === 'entrada' ? 'entrada' : 'salida';
                
                return {
                    hasRecentRecord: text.includes(actionText),
                    recordText: firstRow.textContent?.trim(),
                    totalRecords: rows.length
                };
            }, action);

            if (recentRecord && recentRecord.hasRecentRecord) {
                fichajeSatisfactorio = true;
                mensajeResultado = `Verificación exitosa: Registro encontrado en lista de presencia - ${recentRecord.recordText}`;
            }

        } catch (verificationError) {
            console.log('No se pudo verificar en lista de presencia:', verificationError.message);
        }

        // Resultado final
        if (fichajeSatisfactorio) {
            console.log('=== FICHAJE COMPLETADO CON ÉXITO ===');
            console.log(`${action.toUpperCase()} registrada correctamente`);
            console.log('Motivo:', mensajeResultado);
            
            res.status(200).json({ 
                success: true, 
                action: action,
                point: point,
                message: mensajeResultado,
                timestamp: new Date().toISOString()
            });
        } else {
            console.error('=== FICHAJE FALLÓ ===');
            console.error('Motivo:', mensajeResultado);
            
            res.status(500).json({ 
                success: false, 
                error: `Fichaje de ${action} falló: ${mensajeResultado}`,
                action: action,
                point: point
            });
        }

    } catch (error) {
        console.error('=== ERROR EN EL PROCESO ===');
        console.error('Error detallado:', error.message);
        console.error('Stack trace:', error.stack);
        
        res.status(500).json({ 
            success: false, 
            error: error.message,
            action: action || 'desconocida',
            timestamp: new Date().toISOString()
        });
    } finally {
        if (browser) {
            console.log('Cerrando navegador...');
            await browser.close();
        }
        console.log('=== FIN DEL PROCESO ===');
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor de fichaje Beta10 ejecutándose en puerto ${PORT}`);
    console.log(`📅 Iniciado el: ${new Date().toISOString()}`);
});
