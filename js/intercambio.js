// ==========================================
// INTERCAMBIO DE CONFIGURACIONES ENTRE USUARIOS
//
// El cliente configura una vitrina, exporta un fichero y nos lo envía.
// Al importarlo, Adinor obtiene la MISMA configuración para imprimir los
// PDFs y copiar los datos a Odoo, sin poder alterar el diseño.
//
// Principio de fondo: el fichero guarda lo ELEGIDO, nunca lo calculado.
// Al importar se reproducen las mismas acciones que haría el usuario sobre
// el Form1 y se deja que el pipeline normal recalcule todo. Así, el día que
// se añada un campo derivado, la importación lo hereda sola.
//
// El bloque de control guarda los valores calculados en origen SOLO para
// compararlos con los recalculados. Si no coinciden (p. ej. cambió un
// descuento de vidrio en config.js entre la exportación y la importación),
// se rechaza: el compromiso con el cliente es reproducir con fidelidad.
// NO incluye precios: la tarifa puede y debe cambiar sin invalidar nada.
// ==========================================

const INTERCAMBIO_MAGIC  = 'ADINOR-VITRINA';
const INTERCAMBIO_SCHEMA = 1;              // sube solo si cambia la ESTRUCTURA del fichero
const INTERCAMBIO_EXT    = '.advit';

// Modo solo lectura tras importar. Bloquea la vuelta al Form1 y los
// controles de la hoja de fabricación; deja editar Nº Pedido y Cliente.
let modoImportado = false;
let origenImportado = null;   // { numPedido, cliente, exportado, app }

// ==========================================
// CODIFICACIÓN Y SELLO
// ==========================================

// Base64 seguro con UTF-8 (btoa solo admite latin-1).
function b64Encode(texto) {
    const bytes = new TextEncoder().encode(texto);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
}

function b64Decode(b64) {
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

// FNV-1a de 32 bits. No es criptográfico y no pretende serlo: detecta
// corrupción y edición accidental, que es el riesgo real aquí.
function checksumTexto(texto) {
    let h = 0x811c9dc5;
    for (let i = 0; i < texto.length; i++) {
        h ^= texto.charCodeAt(i);
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
}

// ==========================================
// BLOQUE DE CONTROL
// ==========================================

// Geometría calculada. Se compara tal cual al importar.
// Cn es la única cota derivada: B1, B2 y C1..Cn-1 son elección del usuario.
function construirBloqueControl() {
    const control = {
        alturaReal:        state.alturaReal,
        anchoReal:         state.anchoReal,
        vidrioAlto:        state.vidrioAlto,
        vidrioAncho:       state.vidrioAncho,
        bisagrasNominal:   state.bisagrasNominal,
        bisagrasTotal:     state.bisagrasTotal,
        bisagrasMaxTecnico: state.bisagrasMaxTecnico
    };
    if (typeof calcularCn === 'function' && state.bisagrasTotal > 1) {
        control.cn = calcularCn();
    }
    return control;
}

const CONTROL_ETIQUETAS = {
    alturaReal:         'Alto de la vitrina',
    anchoReal:          'Ancho de la vitrina',
    vidrioAlto:         'Alto del vidrio',
    vidrioAncho:        'Ancho del vidrio',
    bisagrasNominal:    'Bisagras nominales',
    bisagrasTotal:      'Bisagras totales',
    bisagrasMaxTecnico: 'Máximo técnico de bisagras',
    cn:                 'Cota Cn'
};

// Devuelve null si todo cuadra, o el texto de la primera discrepancia.
function compararControl(esperado) {
    if (!esperado) return 'El fichero no incluye bloque de control.';
    const actual = construirBloqueControl();
    for (const clave of Object.keys(esperado)) {
        const a = Number(esperado[clave]);
        const b = Number(actual[clave]);
        if (!isFinite(a) || !isFinite(b)) continue;
        // Tolerancia de 0.01 mm: absorbe el redondeo de coma flotante de Cn,
        // no una diferencia real de cálculo.
        if (Math.abs(a - b) > 0.01) {
            const et = CONTROL_ETIQUETAS[clave] || clave;
            return `${et}: el fichero dice ${a} y ahora se calcula ${b}.`;
        }
    }
    return null;
}

// ==========================================
// EXPORTAR
// ==========================================

// Nombre corto y reconocible: el Nº Pedido es obligatorio para exportar.
function nombreFicheroIntercambio() {
    const limpio = (state.numPedido || '')
        .replace(/[^A-Za-z0-9\-_]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40);
    return `VIT-${limpio || 'SIN-PEDIDO'}${INTERCAMBIO_EXT}`;
}

function exportarConfiguracion(ev) {
    ev?.preventDefault();
    if (!puedeExportar()) {
        aviso(motivoNoExportar() || 'La configuración no está completa.');
        return;
    }

    // Lista de un elemento: hoy solo se exporta una vitrina, pero el formato
    // admite varias sin tener que subir el schema si algún día hace falta.
    const configuraciones = [{
        cabecera: {
            numPedido: state.numPedido,
            cliente:   state.cliente,
            nota:      state.nota
        },
        config: {
            modelo:           state.modelo,
            acabado:          state.acabado,
            acabadoEspecial:  state.acabadoEspecial,
            alturaReal:       state.alturaReal,
            alturaDescuento:  state.alturaDescuento,
            anchoReal:        state.anchoReal,
            anchoDescuento:   state.anchoDescuento,
            cantidad:         state.cantidad,
            sinMecanizado:    state.sinMecanizado,
            bisagrasExtras:   state.bisagrasExtras,
            adjuntarBisagras: state.adjuntarBisagras,
            tirador:          state.tirador,
            tiradorTipo:      state.tiradorTipo,
            vidrioMontado:    state.vidrioMontado,
            colorVidrio:      state.colorVidrio,
            vidrioEspecial:   state.vidrioEspecial
        },
        fab: {
            mano:        fabState.mano,
            tiradorPos:  fabState.tiradorPos,
            tiradorZ:    fabState.tiradorZ,
            b1:          fabState.b1,
            b2:          fabState.b2,
            csEditables: fabState.csEditables.slice(),
            bisMontaje:  fabState.bisMontaje,
            bisBase:     fabState.bisBase,
            bisColor:    fabState.bisColor
        },
        control: construirBloqueControl()
    }];

    // Todo lo sellable va en 'firmado': schema, versión y fecha incluidas.
    // Si quedaran fuera se podrían reescribir sin romper el checksum.
    const firmado = {
        schema:    INTERCAMBIO_SCHEMA,
        app:       window.VERSION_APP || '',
        exportado: new Date().toISOString(),
        configuraciones
    };
    const sobre = { ...firmado, checksum: checksumTexto(JSON.stringify(firmado)) };

    const nombre = nombreFicheroIntercambio();
    const contenido = `${INTERCAMBIO_MAGIC}/${INTERCAMBIO_SCHEMA}\n${b64Encode(JSON.stringify(sobre))}\n`;
    const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    // El blob se libera en el siguiente ciclo: si se revoca de inmediato,
    // Firefox puede cancelar la descarga mientras el diálogo sigue abierto.
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 0);

    // Solo la primera exportación de la sesión: quien exporta varias vitrinas
    // seguidas no necesita que se lo recuerden cada vez. Va después de lanzar
    // la descarga, no antes, para poder nombrar el fichero ya generado.
    if (!avisoDescargaMostrado) {
        avisoDescargaMostrado = true;
        aviso(`Se ha generado el fichero ${nombre}\n\n` +
              'Si el navegador no te ha preguntado dónde guardarlo, lo encontrarás ' +
              'en tu carpeta de Descargas.');
    }
}

// Se reinicia al recargar la página, que es lo que queremos: una vez por sesión.
let avisoDescargaMostrado = false;

// Condición de exportación: además de cotas y bisagras válidas (lo mismo que
// exige el PDF), Cliente y Nº Pedido rellenos — son la trazabilidad.
function puedeExportar() {
    return !motivoNoExportar();
}

function motivoNoExportar() {
    if (typeof cotasValidas === 'function' && !cotasValidas())
        return `Hay cotas de bisagra por debajo del mínimo (${CONFIG.bisagras_C_minimo} mm)`;
    if (typeof bisagrasCompletas === 'function' && !bisagrasCompletas())
        return 'Selecciona montaje, base y color de bisagra';
    if (!(state.numPedido || '').trim()) return 'Falta el Nº Pedido (obligatorio para exportar)';
    if (!(state.cliente   || '').trim()) return 'Falta el Cliente (obligatorio para exportar)';
    return null;
}

// ==========================================
// IMPORTAR
// ==========================================

// Error de importación con mensaje ya redactado para el usuario.
class ErrImport extends Error {}

function pedirFicheroImportacion() {
    const input = document.getElementById('inputImportar');
    if (!input) return;
    confirmar(
        'Se eliminará el diseño actual y se cargará la configuración del fichero. ¿Continuar?',
        () => { input.value = ''; input.click(); }
    );
}

function onFicheroSeleccionado(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const lector = new FileReader();
    lector.onload = () => {
        try {
            importarTexto(String(lector.result));
        } catch (err) {
            if (err instanceof ErrImport) {
                aviso(err.message);
            } else {
                console.error(err);
                aviso('No se ha podido leer el fichero: está dañado o no tiene el formato esperado.');
            }
        }
    };
    lector.onerror = () => aviso('No se ha podido leer el fichero.');
    lector.readAsText(file);
}

function importarTexto(texto) {
    const sobre = abrirSobre(texto);
    const cfgs  = sobre.configuraciones;

    if (!Array.isArray(cfgs) || cfgs.length === 0)
        throw new ErrImport('El fichero no contiene ninguna configuración.');
    if (cfgs.length > 1)
        throw new ErrImport('Este fichero contiene varias configuraciones. Esta versión solo admite una.');

    const item = cfgs[0];
    if (!item || !item.config || !item.fab)
        throw new ErrImport('El fichero está incompleto: falta la configuración o las cotas de fabricación.');

    // 1) Reproducir las elecciones sobre el Form1 y dejar que recalcule todo.
    replayConfiguracion(item.config, item.cabecera || {});

    // 2) Entrar a fabricación (resetea fabState a partir del nuevo state)
    //    y sobreescribir con las cotas elegidas en origen.
    //    Si algo falla de aquí en adelante hay que salir de la hoja: no puede
    //    quedarse a la vista una fabricación a medio reconstruir.
    try {
        pasarAFabricacion();
        aplicarFabImportado(item.fab);

        // 3) Solo ahora, con todo recalculado, se compara con el bloque de control.
        const discrepancia = compararControl(item.control);
        if (discrepancia) {
            throw new ErrImport(
                'La configuración no se reproduce con exactitud y no se puede importar.\n\n' +
                discrepancia + '\n\n' +
                'Es probable que se generase con una versión anterior del configurador. ' +
                'Pide al cliente que la vuelva a exportar.'
            );
        }
    } catch (err) {
        volverConfigurador();
        ejecutarReset();
        throw err;
    }

    // 4) Bloquear y dejar constancia del origen.
    origenImportado = {
        numPedido: (item.cabecera && item.cabecera.numPedido) || '',
        cliente:   (item.cabecera && item.cabecera.cliente)   || '',
        exportado: sobre.exportado || '',
        app:       sobre.app || ''
    };
    modoImportado = true;
    aplicarModoImportado();
}

// Comprueba cabecera mágica, schema y checksum. El nombre del fichero no
// interviene: lo que identifica al fichero es su primera línea.
function abrirSobre(texto) {
    const lineas = String(texto).split('\n');
    const cabecera = (lineas[0] || '').trim();
    const carga    = (lineas.slice(1).join('') || '').replace(/\s+/g, '');

    if (!cabecera.startsWith(INTERCAMBIO_MAGIC + '/'))
        throw new ErrImport('Este fichero no es una configuración de Vitrinas Adinor.');

    const schemaFichero = parseInt(cabecera.split('/')[1], 10);

    // Se descifra ANTES de comprobar el schema: así el aviso puede nombrar la
    // versión de la app, que es el único número que el usuario ve en pantalla.
    // El número de schema es cosa nuestra y no sale nunca en un mensaje.
    let sobre;
    try {
        sobre = JSON.parse(b64Decode(carga));
    } catch (e) {
        throw new ErrImport('El fichero está dañado y no se puede leer.');
    }

    if (schemaFichero !== INTERCAMBIO_SCHEMA)
        throw new ErrImport(mensajeVersionIncompatible(schemaFichero, sobre.app));

    const { checksum, ...firmado } = sobre;
    if (checksum !== checksumTexto(JSON.stringify(firmado)))
        throw new ErrImport('El fichero ha sido modificado después de generarse. No se puede importar.');

    // La cabecera de texto va fuera del sello, así que se contrasta con el
    // schema firmado: editar la primera línea no cuela.
    if (Number(sobre.schema) !== schemaFichero)
        throw new ErrImport('El fichero ha sido modificado después de generarse. No se puede importar.');

    return sobre;
}

// Aviso de incompatibilidad en términos que el usuario reconoce: la versión
// de la app (V.02), nunca el número interno de formato.
function mensajeVersionIncompatible(schemaFichero, appFichero) {
    const actual = window.VERSION_APP || 'la actual';
    const origen = appFichero ? `la versión ${appFichero}` : 'una versión anterior';

    if (schemaFichero > INTERCAMBIO_SCHEMA) {
        return `Este fichero se creó con ${appFichero ? 'la versión ' + appFichero : 'una versión más reciente'} ` +
               `del configurador, posterior a la tuya (${actual}).\n\n` +
               'Actualiza el configurador para poder abrirlo.';
    }
    return `Este fichero se creó con ${origen} del configurador y no es compatible con ${actual}.\n\n` +
           'Pide al cliente que lo vuelva a exportar con la versión actual.';
}

// ==========================================
// REPLAY SOBRE EL FORM1
// ==========================================

// Reproduce las elecciones llamando a las mismas funciones que la interfaz.
// No asigna campos derivados: los calcula el pipeline normal.
function replayConfiguracion(c, cab) {
    ejecutarReset();

    // Modelo
    const cardModelo = [...elementos.modelos].find(el => el.dataset.modelo === c.modelo);
    if (!cardModelo) throw new ErrImport(`El perfil "${c.modelo}" ya no existe en el configurador.`);
    seleccionarModelo(cardModelo);

    // Acabado
    const itemAcabado = [...elementos.acabados].find(el => el.dataset.acabado === c.acabado);
    if (!itemAcabado) throw new ErrImport(`El acabado "${c.acabado}" ya no existe en el configurador.`);
    seleccionarAcabado(itemAcabado);
    if (c.acabado === 'ESP') setInput(elementos.acabadoEspecial, c.acabadoEspecial || '', 'input');

    // Medidas: se fija el real y el descuento; el módulo lo deriva calcularMedida.
    if (elementos.alturaDescuento) elementos.alturaDescuento.value = c.alturaDescuento ?? 2;
    if (elementos.alturaReal)      elementos.alturaReal.value      = c.alturaReal ?? '';
    calcularMedida('altura', 'real');

    if (elementos.anchoDescuento) elementos.anchoDescuento.value = c.anchoDescuento ?? 2;
    if (elementos.anchoReal)      elementos.anchoReal.value      = c.anchoReal ?? '';
    calcularMedida('ancho', 'real');

    if (!state.alturaValido || !state.anchoValido)
        throw new ErrImport('Las medidas del fichero ya no son válidas para este perfil.');

    // Marco limpio
    if (c.sinMecanizado && elementos.sinMecanizado && !elementos.sinMecanizado.disabled) {
        elementos.sinMecanizado.checked = true;
        elementos.sinMecanizado.dispatchEvent(new Event('change'));
    }

    // Bisagras extra: un clic por unidad, como haría el usuario.
    const extras = parseInt(c.bisagrasExtras, 10) || 0;
    for (let i = 0; i < extras; i++) cambiarBisagrasExtra(+1);
    if (state.bisagrasExtras !== extras)
        throw new ErrImport('El número de bisagras del fichero ya no es posible con estas medidas.');

    // Adjuntar bisagras (si el modelo no lo fuerza)
    if (!state._adjuntarForzado && c.adjuntarBisagras !== null && c.adjuntarBisagras !== undefined)
        setAdjuntarBisagras(c.adjuntarBisagras);

    // Tirador
    if (c.tirador && elementos.tirador && !elementos.tirador.disabled) {
        elementos.tirador.checked = true;
        elementos.tirador.dispatchEvent(new Event('change'));
        const cardTir = [...elementos.tiradoresCards].find(el => el.dataset.tirador === c.tiradorTipo);
        if (!cardTir) throw new ErrImport(`El tirador "${c.tiradorTipo}" ya no está disponible para este perfil.`);
        seleccionarTirador(cardTir);
    }
    if (c.tirador && !state.tirador)
        throw new ErrImport('El tirador del fichero ya no es compatible con este perfil o estas medidas.');

    // Vidrio
    if (c.vidrioMontado && elementos.vidrioMontado && !elementos.vidrioMontado.disabled) {
        elementos.vidrioMontado.checked = true;
        elementos.vidrioMontado.dispatchEvent(new Event('change'));
        setInput(elementos.colorVidrio, c.colorVidrio || '', 'change');
        if (c.colorVidrio === 'especial') setInput(elementos.vidrioEspecial, c.vidrioEspecial || '', 'input');
    }
    if (c.vidrioMontado && !state.vidrioMontado)
        throw new ErrImport('El vidrio montado del fichero ya no es posible con estas medidas.');

    // Cantidad
    setInput(elementos.cantidad, c.cantidad ?? 1, 'change');

    // Cabecera
    setInput(elementos.numPedido, cab.numPedido || '', 'input');
    setInput(elementos.cliente,   cab.cliente   || '', 'input');
    setInput(elementos.nota,      cab.nota      || '', 'input');

    if (elementos.btnFabricar && elementos.btnFabricar.disabled)
        throw new ErrImport('La configuración del fichero está incompleta y no se puede reproducir.');
}

function setInput(el, valor, evento) {
    if (!el) return;
    el.value = valor;
    el.dispatchEvent(new Event(evento));
}

// Sobreescribe fabState con lo elegido en origen y revalida por el camino normal.
function aplicarFabImportado(f) {
    fabState.mano        = f.mano;
    fabState.tiradorPos  = f.tiradorPos;
    fabState.tiradorZ    = f.tiradorZ;
    fabState.b1          = f.b1;
    fabState.b2          = f.b2;
    fabState.csEditables = Array.isArray(f.csEditables) ? f.csEditables.slice() : [];
    fabState.bisMontaje  = f.bisMontaje;
    fabState.bisBase     = f.bisBase;
    fabState.bisColor    = f.bisColor;

    renderFabIzq();
    renderFabSVGs();
    actualizarEstadoPDF();

    if (!cotasValidas())
        throw new ErrImport('Las cotas de bisagra del fichero ya no son válidas.');
    if (!bisagrasCompletas())
        throw new ErrImport('La selección de bisagras del fichero está incompleta.');
}

// ==========================================
// MODO SOLO LECTURA
// ==========================================

// Un único punto de bloqueo: se desactivan todos los controles de la hoja.
// Más seguro que ir marcando disabled campo a campo en cada render, donde
// olvidar uno pasa inadvertido.
function aplicarModoImportado() {
    const fabVista = document.getElementById('fabVista');
    if (fabVista) fabVista.classList.add('fab-importado');

    // Sin vuelta al Form1: no hay nada que editar allí.
    const btnVolver = document.getElementById('fabBtnVolver');
    if (btnVolver) btnVolver.style.display = 'none';

    // Exportar no tiene sentido sobre algo importado.
    const btnExp = document.getElementById('fabBtnExportar');
    if (btnExp) btnExp.style.display = 'none';

    document.querySelectorAll('#fabInputs input, #fabInputs button, #fabInputs select, ' +
                              '#fabBisagras input, #fabBisagras button, #fabBisagras select')
        .forEach(el => { el.disabled = true; });

    renderBandaImportado();
}

// Banda de aviso con los dos únicos campos editables tras importar:
// Nº Pedido y Cliente son cabecera, no geometría — modificarlos no altera
// lo que el cliente se ha comprometido a que reproduzcamos.
function renderBandaImportado() {
    const cont = document.getElementById('fabBandaImportado');
    if (!cont) return;
    const fecha = origenImportado?.exportado
        ? new Date(origenImportado.exportado).toLocaleDateString('es-ES')
        : '—';

    cont.innerHTML = `
        <div class="fab-imp-aviso">
            🔒 Configuración importada · solo lectura
            <span class="fab-imp-origen">Origen: ${escaparHtml(origenImportado?.numPedido || '—')} ·
                ${escaparHtml(origenImportado?.cliente || '—')} · ${fecha} · ${escaparHtml(origenImportado?.app || '')}</span>
        </div>
        <div class="fab-imp-campos">
            <label>Nº Pedido
                <input type="text" id="impNumPedido" value="${escaparHtml(state.numPedido || '')}">
            </label>
            <label>Cliente
                <input type="text" id="impCliente" value="${escaparHtml(state.cliente || '')}">
            </label>
            <label class="fab-imp-accion">
                <span>&nbsp;</span>
                <button type="button" class="fab-imp-salir" id="impSalir"
                        title="Descartar y volver al configurador">↩ Salir</button>
            </label>
        </div>`;
    cont.style.display = '';

    document.getElementById('impNumPedido')?.addEventListener('input', e => {
        state.numPedido = e.target.value.trim();
    });
    document.getElementById('impCliente')?.addEventListener('input', e => {
        state.cliente = e.target.value.trim();
    });
    document.getElementById('impSalir')?.addEventListener('click', salirModoImportado);
}

// Única salida del modo importado. Se recarga la página en vez de intentar
// deshacer el bloqueo campo a campo: así se garantiza un estado limpio y no
// queda ningún resto de la configuración del cliente.
function salirModoImportado() {
    confirmar('Se descartará la configuración importada y volverás al configurador. ¿Continuar?',
              () => {
                  // Navegación a la misma URL en vez de reload(): recargar hace que
                  // el navegador restaure los valores de los inputs, y quedarían
                  // medidas a la vista con el estado interno ya vacío.
                  window.location.replace(window.location.pathname + window.location.search);
              });
}

function escaparHtml(v) {
    return String(v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Texto de trazabilidad para el pie de los dos PDFs. Usa SIEMPRE el pedido y
// el cliente ORIGINALES del fichero: si se han editado al recibirlo, el
// documento debe dejar constancia de ambos.
function lineaTrazabilidad() {
    if (!modoImportado || !origenImportado) return '';
    const fecha = origenImportado.exportado
        ? new Date(origenImportado.exportado).toLocaleDateString('es-ES')
        : '';
    const partes = ['Importado'];
    if (origenImportado.numPedido) partes.push(`Pedido origen: ${origenImportado.numPedido}`);
    if (origenImportado.cliente)   partes.push(origenImportado.cliente);
    if (fecha)                     partes.push(fecha);
    if (origenImportado.app)       partes.push(origenImportado.app);
    return partes.join(' · ');
}

// ==========================================
// INICIALIZACIÓN
// ==========================================

function inicializarIntercambio() {
    document.getElementById('fabBtnExportar')?.addEventListener('click', exportarConfiguracion);
    document.getElementById('btnImportar')?.addEventListener('click', pedirFicheroImportacion);
    document.getElementById('inputImportar')?.addEventListener('change', onFicheroSeleccionado);
}

document.addEventListener('DOMContentLoaded', inicializarIntercambio);
