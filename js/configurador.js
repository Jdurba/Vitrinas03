// ==========================================
// ESTADO DE LA APLICACIÓN
// ==========================================
const state = {
    modelo: null,
    acabado: null,
    acabadoEspecial: '',   // texto libre, solo relevante si acabado === 'ESP'
    vidrioEspecial: '',    // texto libre, solo relevante si colorVidrio === 'especial'
    alturaModulo: 0,
    alturaDescuento: 2,
    alturaReal: 0,
    alturaValido: null,
    anchoModulo: 0,
    anchoDescuento: 2,
    anchoReal: 0,
    anchoValido: null,
    cantidad: 1,
    numPedido: '',
    cliente: '',
    nota: '',              // texto libre de cabecera; acompaña al documento, no define la vitrina
    bisagrasNominal: 0,
    bisagrasExtras: 0,
    precioMecExtra: null,   // €/mecanizado bisagra extra (VV.MEC.B), cargado del CSV en init
    bisagrasTotal: 0,
    bisagrasMaxTecnico: 0,
    bisagrasCalculadas: 0,
    sinMecanizado: false,
    adjuntarBisagras: null,   // null = sin responder, true = Sí, false = No
    tirador: false,
    tiradorTipo: null,
    vidrioMontado: false,
    colorVidrio: '',
    vidrioAlto: 0,
    vidrioAncho: 0
};

// Límite duro de fabricación del vidrio (mm)
const VIDRIO_MAX_ALTO = 2800;

// ==========================================
// GEOMETRÍA DEL TIRADOR (compartido con fabricacion.js)
// ==========================================
// El tirador se acota por su CENTRO (cota Z). Para que no se salga de la
// puerta, ese centro debe quedar a >= (borde + medio tirador) de los dos
// extremos. De ahí salen las tres funciones; no hay tablas de medidas.

// Cota Z mínima admisible. La máxima es (dimensión − este valor).
function tiradorZMin(tipo) {
    const largo = CONFIG.tiradores[tipo]?.largoMm;
    if (!largo) return 0;
    return CONFIG.tirador_borde_minimo + Math.ceil(largo / 2);
}

// Medida mínima de la puerta en la dirección en que va el tirador.
function tiradorDimMin(tipo) {
    const largo = CONFIG.tiradores[tipo]?.largoMm;
    if (!largo) return 0;
    return largo + 2 * CONFIG.tirador_borde_minimo;
}

// Posiciones en que cabe. 'opuesto' va en vertical (manda la altura);
// 'arriba' y 'abajo' van en horizontal (manda el ancho).
function tiradorPosicionesValidas(tipo, alturaReal, anchoReal) {
    const min = tiradorDimMin(tipo);
    const pos = [];
    if (alturaReal >= min) pos.push('opuesto');
    if (anchoReal  >= min) pos.push('arriba', 'abajo');
    return pos;
}

// ==========================================
// ELEMENTOS DOM
// ==========================================
const elementos = {
    modelos: document.querySelectorAll('.modelo-card'),
    acabados: document.querySelectorAll('.acabado-item'),
    alturaModulo: document.getElementById('alturaModulo'),
    alturaDescuento: document.getElementById('alturaDescuento'),
    alturaReal: document.getElementById('alturaReal'),
    alturaMensaje: document.getElementById('alturaMensaje'),
    anchoModulo: document.getElementById('anchoModulo'),
    anchoDescuento: document.getElementById('anchoDescuento'),
    anchoReal: document.getElementById('anchoReal'),
    anchoMensaje: document.getElementById('anchoMensaje'),
    cantidad: document.getElementById('cantidad'),
    numPedido: document.getElementById('numPedido'),
    cliente: document.getElementById('cliente'),
    nota: document.getElementById('nota'),
    notaContador: document.getElementById('notaContador'),
    sinMecanizado: document.getElementById('sinMecanizado'),
    adjuntarBisagrasGroup: document.getElementById('adjuntarBisagrasGroup'),
    adjuntarSi: document.getElementById('adjuntarSi'),
    adjuntarNo: document.getElementById('adjuntarNo'),
    bisagrasWidget: document.getElementById('bisagrasWidget'),
    bisagrasNominalInfo: document.getElementById('bisagrasNominalInfo'),
    bisagrasNum: document.getElementById('bisagrasNum'),
    bisagrasMenos: document.getElementById('bisagrasMenos'),
    bisagrasmas: document.getElementById('bisagrasmas'),
    bisagrasMecanizadoPrecio: document.getElementById('bisagrasMecanizadoPrecio'),
    tirador: document.getElementById('tirador'),
    tiradorAviso: document.getElementById('tiradorAviso'),
    tiradoresSelector: document.getElementById('tiradoresSelector'),
    tiradoresCards: document.querySelectorAll('.tirador-card'),
    vidrioMontado: document.getElementById('vidrioMontado'),
    colorVidrio: document.getElementById('colorVidrio'),
    colorVidrioLabel: document.getElementById('colorVidrioLabel'),
    acabadoEspecial: document.getElementById('acabadoEspecial'),
    acabadoEspecialGroup: document.getElementById('acabadoEspecialGroup'),
    vidrioEspecial: document.getElementById('vidrioEspecial'),
    vidrioEspecialGroup: document.getElementById('vidrioEspecialGroup'),
    resumenModelo: document.getElementById('resumenModelo'),
    resumenAcabado: document.getElementById('resumenAcabado'),
    resumenDimensiones: document.getElementById('resumenDimensiones'),
    resumenVidrioMedidas: document.getElementById('resumenVidrioMedidas'),
    resumenCantidad: document.getElementById('resumenCantidad'),
    resumenBisagras: document.getElementById('resumenBisagras'),
    resumenTirador: document.getElementById('resumenTirador'),
    resumenAdjuntar: document.getElementById('resumenAdjuntar'),
    resumenVidrio: document.getElementById('resumenVidrio'),
    btnFabricar: document.getElementById('btnFabricar'),
    btnReset: document.getElementById('btnReset')
};

// ==========================================
// INICIALIZACIÓN
// ==========================================
async function init() {
    console.log('Inicializando aplicación...');

    // Textos de modelo, acabado y tirador desde CONFIG (única fuente de verdad;
    // el texto escrito en el HTML es solo fallback si el JS no llega a ejecutarse).
    // Evita que las tarjetas y el resumen lateral muestren nombres distintos.
    elementos.modelos.forEach(card => {
        const cfg = CONFIG.modelos[card.dataset.modelo];
        const descEl = card.querySelector('.modelo-desc');
        if (cfg && descEl) descEl.textContent = cfg.nombre;
    });

    elementos.acabados.forEach(item => {
        const cfg = CONFIG.acabados[item.dataset.acabado];
        const nombreEl = item.querySelector('.acabado-nombre');
        if (cfg && nombreEl) nombreEl.textContent = cfg.nombre;
    });

    elementos.tiradoresCards.forEach(card => {
        const cfg = CONFIG.tiradores[card.dataset.tirador];
        const nombreEl = card.querySelector('.tirador-nombre');
        if (cfg && nombreEl) nombreEl.textContent = cfg.medidas;
    });

    elementos.modelos.forEach(card => {
        card.addEventListener('click', () => seleccionarModelo(card));
    });

    elementos.acabados.forEach(item => {
        item.addEventListener('click', () => seleccionarAcabado(item));
    });

    elementos.alturaModulo?.addEventListener('blur', () => calcularMedida('altura', 'modulo'));
    elementos.alturaDescuento?.addEventListener('blur', () => calcularMedida('altura', 'descuento'));
    elementos.alturaReal?.addEventListener('blur', () => calcularMedida('altura', 'real'));
    elementos.anchoModulo?.addEventListener('blur', () => calcularMedida('ancho', 'modulo'));
    elementos.anchoDescuento?.addEventListener('blur', () => calcularMedida('ancho', 'descuento'));
    elementos.anchoReal?.addEventListener('blur', () => calcularMedida('ancho', 'real'));

    elementos.cantidad?.addEventListener('change', actualizarCantidad);
    elementos.numPedido?.addEventListener('input', e => { state.numPedido = e.target.value.trim(); });
    elementos.cliente?.addEventListener('input', e => { state.cliente = e.target.value.trim(); });
    // Sin trim() en el listener: se conservan los saltos de línea intermedios.
    // Se recorta en el punto de uso (informe y PDFs).
    elementos.nota?.addEventListener('input', e => {
        state.nota = e.target.value;
        if (elementos.notaContador) elementos.notaContador.textContent = `${state.nota.length} / 250`;
    });
    elementos.bisagrasMenos?.addEventListener('click', () => cambiarBisagrasExtra(-1));
    elementos.bisagrasmas?.addEventListener('click', () => cambiarBisagrasExtra(+1));
    elementos.sinMecanizado?.addEventListener('change', actualizarSinMecanizado);
    elementos.adjuntarSi?.addEventListener('click', () => setAdjuntarBisagras(true));
    elementos.adjuntarNo?.addEventListener('click', () => setAdjuntarBisagras(false));
    elementos.tirador?.addEventListener('change', actualizarTirador);

    elementos.tiradoresCards.forEach(card => {
        card.addEventListener('click', () => seleccionarTirador(card));
    });

    elementos.vidrioMontado?.addEventListener('change', actualizarVidrio);
    elementos.colorVidrio?.addEventListener('change', actualizarColorVidrio);

    elementos.acabadoEspecial?.addEventListener('input', e => {
        state.acabadoEspecial = e.target.value.trim();
        validarFormulario();
    });
    elementos.vidrioEspecial?.addEventListener('input', e => {
        state.vidrioEspecial = e.target.value.trim();
        validarFormulario();
    });

    elementos.btnFabricar?.addEventListener('click', pasarAFabricacion);
    elementos.btnReset?.addEventListener('click', resetearDatos);

    // Precio del mecanizado de bisagra extra (VV.MEC.B) desde TarifaExtras.csv.
    // Una sola carga: cachea en state. El reset re-lee de aquí, no recarga CSV.
    try {
        await cargarExtras();
        const mec = buscarMecanizado('VV.MEC.B');
        state.precioMecExtra = (mec.encontrado && !mec.consultar) ? mec.tarifa : null;
    } catch (e) {
        console.warn('No se pudo cargar el precio de mecanizado extra:', e);
        state.precioMecExtra = null;
    }

    actualizarResumen();
    validarFormulario();

    console.log('Aplicación inicializada correctamente');
}

// ==========================================
// SELECCIÓN DE MODELO
// ==========================================
function seleccionarModelo(card) {
    elementos.modelos.forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    state.modelo = card.dataset.modelo;

    actualizarVistaPrevia();
    filtrarAcabadosPorModelo();
    actualizarDisponibilidadTirador();

    if (!state.alturaReal || state.alturaReal === 0) {
        mostrarValidacion('altura', validarMedida('altura', 0));
    } else {
        mostrarValidacion('altura', validarMedida('altura', state.alturaReal));
    }

    if (!state.anchoReal || state.anchoReal === 0) {
        mostrarValidacion('ancho', validarMedida('ancho', 0));
    } else {
        mostrarValidacion('ancho', validarMedida('ancho', state.anchoReal));
    }

    if (state.alturaReal > 0) {
        const v = validarMedida('altura', state.alturaReal);
        avisarSiBloqueoVidrio(v);
        actualizarDisponibilidadVidrio(!!v.motivoVidrio);
        if (v.valido && !v.bloqueado) {
            calcularBisagrasAutomaticas();
        } else {
            resetearWidgetBisagras();
        }
    } else {
        resetearWidgetBisagras();
    }

    calcularVidrio();
    actualizarEstadoSinMecanizado();
    aplicarEstadoAdjuntarBisagras();
    actualizarResumen();
    validarFormulario();
}

// El check "Sin mecanizado" no aplica a modelos con bisagras obligatorias
// (KABI/HAVA/HAVASP): siempre van mecanizadas. Se deshabilita y se fuerza a false.
function actualizarEstadoSinMecanizado() {
    const modeloConfig = CONFIG.modelos[state.modelo];
    const bisagrasObligatorias = !!modeloConfig?.bisagras_fijas;

    if (!elementos.sinMecanizado) return;

    if (bisagrasObligatorias) {
        if (state.sinMecanizado) {
            // Estaba marcado: revertir a estado mecanizado
            state.sinMecanizado = false;
            elementos.bisagrasWidget?.classList.remove('deshabilitado');
        }
        elementos.sinMecanizado.checked   = false;
        elementos.sinMecanizado.disabled  = true;
        elementos.sinMecanizado.closest('.checkbox-item')?.classList.add('disabled');
    } else {
        elementos.sinMecanizado.disabled = false;
        elementos.sinMecanizado.closest('.checkbox-item')?.classList.remove('disabled');
    }
}

// ==========================================
// ACTUALIZAR VISTA PREVIA DEL PERFIL
// ==========================================
function actualizarVistaPrevia() {
    const previewContainer = document.getElementById('previewVitrina');
    if (!previewContainer) return;

    if (state.modelo) {
        const modeloConfig = CONFIG.modelos[state.modelo];
        const nombreImagen = modeloConfig?.imagen || state.modelo;
        const imagenUrl = `https://raw.githubusercontent.com/Jdurba/Vitrinas/main/Imagenes/${nombreImagen}_cotas.jpg`;
        previewContainer.innerHTML = `
            <img src="${imagenUrl}"
                 alt="Perfil ${state.modelo}"
                 class="vitrina-preview-img"
                 onerror="this.parentElement.innerHTML='<div class=\\'preview-placeholder\\'><span>Imagen no disponible</span></div>'">
        `;
    } else {
        previewContainer.innerHTML = `<div class="preview-placeholder"><span>Vista previa del perfil</span></div>`;
    }
}

// ==========================================
// FILTRAR ACABADOS POR MODELO
// ==========================================
function filtrarAcabadosPorModelo() {
    const modeloConfig = CONFIG.modelos[state.modelo];
    const acabadosPermitidos = modeloConfig?.acabados || Object.keys(CONFIG.acabados);
    const ACABADOS_UNIVERSALES = ['ESP'];   // disponibles en todos los perfiles

    elementos.acabados.forEach(item => {
        const acabado = item.dataset.acabado;
        const disponible = acabadosPermitidos.includes(acabado) || ACABADOS_UNIVERSALES.includes(acabado);

        item.style.opacity = disponible ? '1' : '0.3';
        item.style.pointerEvents = disponible ? 'auto' : 'none';
        item.title = disponible ? '' : 'No disponible para este perfil';

        if (!disponible && state.acabado === acabado) {
            item.classList.remove('selected');
            state.acabado = null;
            actualizarResumen();
            validarFormulario();
        }
    });
}

// ==========================================
// DISPONIBILIDAD DEL TIRADOR POR MODELO
// ==========================================
function actualizarDisponibilidadTirador() {
    const modeloConfig = CONFIG.modelos[state.modelo];

    const tiradorLabel = elementos.tirador?.closest('label');
    if (!tiradorLabel) return;

    // Filtrado por perfil (tiradoresValidos) ∩ acabado (tirador.acabados) ∩ medidas.
    // El tirador hereda el acabado del perfil → solo aparece si lo soporta.
    // Por medidas solo se filtra cuando ya están las dos cotas: mientras el
    // usuario no las haya puesto, no se le esconde nada.
    const validosModelo = modeloConfig?.tiradoresValidos || [];
    const hayMedidas = state.alturaReal > 0 && state.anchoReal > 0;

    const cabe = tipo => !hayMedidas ||
        tiradorPosicionesValidas(tipo, state.alturaReal, state.anchoReal).length > 0;

    const esValido = tipo => {
        if (!validosModelo.includes(tipo)) return false;
        const acabadosTir = CONFIG.tiradores[tipo]?.acabados;
        if (state.acabado && acabadosTir && !acabadosTir.includes(state.acabado)) return false;
        return cabe(tipo);
    };

    // Dos motivos distintos de bloqueo de la casilla: el perfil no admite
    // tirador, o lo admite pero no cabe ninguno en estas medidas.
    const sinTirador   = !!modeloConfig?.sinTirador;
    const ningunoCabe  = !sinTirador && validosModelo.length > 0 &&
                         !validosModelo.some(esValido);
    const bloqueado    = sinTirador || ningunoCabe;

    if (bloqueado) {
        tiradorLabel.classList.add('disabled');
        elementos.tirador.disabled = true;

        if (state.tirador) {
            elementos.tirador.checked = false;
            state.tirador = false;
            state.tiradorTipo = null;
            elementos.tiradoresCards.forEach(c => c.classList.remove('selected'));
            if (elementos.tiradoresSelector) {
                elementos.tiradoresSelector.classList.remove('visible');
            }
            aviso(sinTirador
                ? 'Este perfil no admite tirador mecanizado.\nSe ha eliminado el tirador de la configuración.'
                : `Ningún tirador cabe en ${state.alturaReal} × ${state.anchoReal} mm.\n` +
                  `Se necesitan al menos ${minCabida(validosModelo)} mm de alto o de ancho.\n` +
                  'Se ha eliminado el tirador de la configuración.');
        }
        const motivo = sinTirador
            ? 'Este perfil no admite tirador mecanizado.'
            : `Ningún tirador cabe en ${state.alturaReal} × ${state.anchoReal} mm: ` +
              `se necesitan al menos ${minCabida(validosModelo)} mm de alto o de ancho.`;
        tiradorLabel.title = motivo;
        if (elementos.tiradorAviso) elementos.tiradorAviso.textContent = motivo;
        return;
    }
    tiradorLabel.title = '';
    if (elementos.tiradorAviso) elementos.tiradorAviso.textContent = '';

    tiradorLabel.classList.remove('disabled');
    elementos.tirador.disabled = false;

    elementos.tiradoresCards.forEach(card => {
        const tipo = card.dataset.tirador;
        const disponible = esValido(tipo);
        card.style.opacity = disponible ? '1' : '0.3';
        card.style.pointerEvents = disponible ? 'auto' : 'none';
        card.title = disponible ? ''
            : (validosModelo.includes(tipo) && !cabe(tipo)
                ? `No cabe: necesita ${tiradorDimMin(tipo)} mm de alto o de ancho`
                : 'No disponible para este perfil/acabado');
    });

    // Si el tirador seleccionado dejó de ser válido: avisar y anular selección
    // (sin tocar el check "sin tirador"; Siguiente queda inhabilitado por tiradorValido).
    if (state.tiradorTipo && !esValido(state.tiradorTipo)) {
        const anterior = state.tiradorTipo;
        state.tiradorTipo = null;
        elementos.tiradoresCards.forEach(c => c.classList.remove('selected'));
        aviso(cabe(anterior)
            ? 'El tirador seleccionado no está disponible para este perfil/acabado.\nSelecciona otro entre los disponibles.'
            : `El tirador seleccionado no cabe en ${state.alturaReal} × ${state.anchoReal} mm.\n` +
              `Necesita ${tiradorDimMin(anterior)} mm de alto o de ancho.\nSelecciona otro entre los disponibles.`);
        actualizarResumen();
        validarFormulario();
    }
}

// Menor medida que haría posible algún tirador de los válidos del perfil.
function minCabida(validosModelo) {
    const mins = validosModelo.map(tiradorDimMin).filter(Boolean);
    return mins.length ? Math.min(...mins) : 0;
}

// ==========================================
// SELECCIÓN DE ACABADO
// ==========================================
function seleccionarAcabado(item) {
    elementos.acabados.forEach(i => i.classList.remove('selected'));
    item.classList.add('selected');
    state.acabado = item.dataset.acabado;
    actualizarCampoAcabadoEspecial();
    actualizarDisponibilidadTirador();
    actualizarResumen();
    validarFormulario();
}

// Muestra el campo de texto solo si el acabado es ESP; al ocultarlo borra el dato.
function actualizarCampoAcabadoEspecial() {
    const esEspecial = state.acabado === 'ESP';
    if (elementos.acabadoEspecialGroup) {
        elementos.acabadoEspecialGroup.style.display = esEspecial ? 'flex' : 'none';
    }
    if (!esEspecial) {
        state.acabadoEspecial = '';
        if (elementos.acabadoEspecial) elementos.acabadoEspecial.value = '';
    }
}

// ==========================================
// CÁLCULO DE MEDIDAS
// ==========================================
function calcularMedida(tipo, campo) {
    const modulo   = parseFloat(elementos[`${tipo}Modulo`]?.value) || 0;
    const descuento = parseFloat(elementos[`${tipo}Descuento`]?.value) || 0;
    const real     = parseFloat(elementos[`${tipo}Real`]?.value) || 0;

    switch (campo) {
        case 'modulo':
        case 'descuento': {
            const nuevoReal = modulo - descuento;
            if (elementos[`${tipo}Real`]) {
                elementos[`${tipo}Real`].value = nuevoReal !== 0 ? nuevoReal : '';
            }
            break;
        }
        case 'real': {
            const nuevoModulo = real + descuento;
            if (elementos[`${tipo}Modulo`]) {
                elementos[`${tipo}Modulo`].value = nuevoModulo !== 0 ? nuevoModulo : '';
            }
            break;
        }
    }

    state[`${tipo}Modulo`]   = parseFloat(elementos[`${tipo}Modulo`]?.value) || 0;
    state[`${tipo}Descuento`] = parseFloat(elementos[`${tipo}Descuento`]?.value) || 0;

    const valorRealInput = elementos[`${tipo}Real`]?.value;
    state[`${tipo}Real`] = valorRealInput !== '' ? parseFloat(valorRealInput) : 0;

    const validacion = validarMedida(tipo, state[`${tipo}Real`]);
    mostrarValidacion(tipo, validacion);
    avisarSiBloqueoVidrio(validacion);
    if (tipo === 'altura') actualizarDisponibilidadVidrio(!!validacion.motivoVidrio);
    calcularVidrio();

    if (validacion.bloqueado) {
        if (tipo === 'altura') resetearWidgetBisagras();
        state[`${tipo}Valido`] = false;
    } else {
        if (tipo === 'altura' && validacion.valido && state[`${tipo}Real`] > 0) {
            calcularBisagrasAutomaticas();
        } else if (tipo === 'altura') {
            resetearWidgetBisagras();
        }
    }

    // Las medidas condicionan qué tiradores caben y en qué posición,
    // así que hay que revalidar la disponibilidad en cada cambio de cota.
    actualizarDisponibilidadTirador();

    actualizarResumen();
    validarFormulario();
}

// ==========================================
// CÁLCULO DE MEDIDAS DE VIDRIO (centralizado)
// Fórmula: real - descuento por modelo (DescV_Alt / DescV_Anc)
// ==========================================
function calcularVidrio() {
    const m = CONFIG.modelos[state.modelo];
    state.vidrioAlto  = (m && state.alturaReal > 0) ? state.alturaReal - (m.DescV_Alt || 0) : 0;
    state.vidrioAncho = (m && state.anchoReal  > 0) ? state.anchoReal  - (m.DescV_Anc || 0) : 0;
}

// Aviso modal si la altura queda bloqueada por vidrio > máximo
function avisarSiBloqueoVidrio(validacion) {
    if (validacion.motivoVidrio) {
        aviso(`El vidrio resultante supera el máximo fabricable de ${VIDRIO_MAX_ALTO} mm de alto.\nNo es posible fabricar esta vitrina.`);
    }
}

// Habilitar/deshabilitar "Montada con Vidrio" según bloqueo por vidrio
function actualizarDisponibilidadVidrio(bloqueado) {
    if (!elementos.vidrioMontado) return;

    const label = elementos.vidrioMontado.closest('label');
    elementos.vidrioMontado.disabled = bloqueado;
    if (label) label.classList.toggle('disabled', bloqueado);

    if (bloqueado && state.vidrioMontado) {
        elementos.vidrioMontado.checked = false;
        // Reutiliza actualizarVidrio(): limpia color, deshabilita select y revalida
        elementos.vidrioMontado.dispatchEvent(new Event('change'));
    }
}

// ==========================================
// VALIDACIÓN DE MEDIDAS
// ==========================================
function validarMedida(tipo, valor) {
    const modelo = CONFIG.modelos[state.modelo];

    if (!modelo) {
        return { valido: false, mensaje: '← Selecciona un modelo primero', clase: 'info', bloqueado: false };
    }

    const max = tipo === 'altura' ? modelo.maxAltura : modelo.maxAncho;
    const min = tipo === 'altura' ? modelo.minAltura : modelo.minAncho;

    if (valor < 0) {
        return { valido: false, mensaje: '⛔ No se permiten valores negativos', clase: 'error', bloqueado: true };
    }

    if (!valor || valor === 0) {
        return { valido: false, mensaje: `Rango válido: ${min}-${max} mm`, clase: 'info', bloqueado: false };
    }

    if (valor < min) {
        return { valido: false, mensaje: `⛔ Mínimo absoluto: ${min} mm`, clase: 'error', bloqueado: true };
    }

    // Bloqueo duro: vidrio resultante supera el máximo fabricable
    if (tipo === 'altura') {
        const vidrioAlto = valor - (modelo.DescV_Alt || 0);
        if (vidrioAlto > VIDRIO_MAX_ALTO) {
            return {
                valido: false,
                mensaje: `⛔ Vidrio ${vidrioAlto} mm supera el máximo fabricable (${VIDRIO_MAX_ALTO} mm)`,
                clase: 'error',
                bloqueado: true,
                motivoVidrio: true
            };
        }
    }

    if (valor > max) {
        return { valido: true, mensaje: `⚠️ Supera máximo recomendado (${max} mm)`, clase: 'advertencia', bloqueado: false };
    }

    return { valido: true, mensaje: `✓ Válido (${min}-${max} mm)`, clase: 'valido', bloqueado: false };
}

// ==========================================
// MOSTRAR VALIDACIÓN
// ==========================================
function mostrarValidacion(tipo, resultado) {
    const inputEl   = elementos[`${tipo}Real`];
    const mensajeEl = elementos[`${tipo}Mensaje`];
    if (!inputEl || !mensajeEl) return;

    inputEl.classList.remove('valido', 'advertencia', 'error', 'bloqueado', 'info');

    if (resultado.bloqueado && state[`${tipo}Real`] > 0) {
        inputEl.classList.add('bloqueado');
    } else if (resultado.clase) {
        inputEl.classList.add(resultado.clase);
    }

    mensajeEl.textContent = resultado.mensaje;
    mensajeEl.className = `medidas-mensaje ${resultado.clase}`;
    state[`${tipo}Valido`] = resultado.valido && !resultado.bloqueado;
}

// ==========================================
// CÁLCULO AUTOMÁTICO DE BISAGRAS
// ==========================================
function calcularBisagrasAutomaticas() {
    const altura = state.alturaReal;
    const modeloConfig = CONFIG.modelos[state.modelo];

    if (!altura || altura <= 0 || !modeloConfig) {
        resetearWidgetBisagras();
        return;
    }

    if (modeloConfig.bisagras_fijas) {
        state.bisagrasNominal    = modeloConfig.bisagras_fijas;
        state.bisagrasExtras     = 0;
        state.bisagrasMaxTecnico = modeloConfig.bisagras_fijas;
        state.bisagrasCalculadas = modeloConfig.bisagras_fijas;
        state.bisagrasTotal      = modeloConfig.bisagras_fijas;
        if (!state.sinMecanizado) renderWidgetBisagras(true);
        return;
    }

    let nominal = 2;
    for (const rango of CONFIG.bisagras_rangos) {
        if (altura <= rango.hasta) { nominal = rango.num; break; }
        nominal = rango.num;
    }

    // Marco limpio: fija el nominal pero deja el widget deshabilitado
    if (state.sinMecanizado) {
        state.bisagrasNominal    = nominal;
        state.bisagrasExtras     = 0;
        state.bisagrasMaxTecnico = nominal;
        state.bisagrasTotal      = nominal;
        state.bisagrasCalculadas = nominal;
        return;
    }

    // Máximo nº de bisagras que caben respetando los mínimos físicos:
    //   floor( 1 + (Altura − 2×B_minimo) / C_minimo )
    // Usa B_minimo (no el defecto) porque es el mejor caso físico: cuántas
    // caben con las bisagras pegadas a su separación mínima. Tope global aparte.
    const Bmin = CONFIG.bisagras_B_minimo;
    const Cmin = CONFIG.bisagras_C_minimo;
    const maxTecnico = Math.min(
        CONFIG.bisagras_max_global,
        Math.floor(1 + (altura - 2 * Bmin) / Cmin)
    );

    state.bisagrasNominal    = nominal;
    state.bisagrasExtras     = 0;
    state.bisagrasMaxTecnico = Math.max(nominal, maxTecnico);
    state.bisagrasTotal      = nominal;
    state.bisagrasCalculadas = nominal;

    renderWidgetBisagras(false);
}

function renderWidgetBisagras(fijas) {
    const { bisagrasNominal, bisagrasMaxTecnico, bisagrasTotal } = state;

    if (elementos.bisagrasWidget) elementos.bisagrasWidget.classList.add('activo');

    if (elementos.bisagrasNominalInfo) {
        elementos.bisagrasNominalInfo.classList.add('activo');
        elementos.bisagrasNominalInfo.textContent = fijas
            ? 'Bisagras fijas para este perfil'
            : `Nominal: ${bisagrasNominal}  ·  Máx. técnico: ${bisagrasMaxTecnico}`;
    }

    if (elementos.bisagrasNum) {
        elementos.bisagrasNum.textContent = bisagrasTotal;
        elementos.bisagrasNum.classList.remove('inactivo');
    }

    const labelEl = document.getElementById('bisagrasLabel');
    if (labelEl) labelEl.classList.remove('disabled');

    if (elementos.bisagrasMenos) elementos.bisagrasMenos.disabled = fijas || bisagrasTotal <= bisagrasNominal;
    if (elementos.bisagrasmas)   elementos.bisagrasmas.disabled   = fijas || bisagrasTotal >= bisagrasMaxTecnico;

    actualizarPrecioBisagrasExtra();
}

function resetearWidgetBisagras() {
    state.bisagrasNominal    = 0;
    state.bisagrasExtras     = 0;
    state.bisagrasMaxTecnico = 0;
    state.bisagrasTotal      = 0;
    state.bisagrasCalculadas = 0;

    if (elementos.bisagrasWidget) elementos.bisagrasWidget.classList.remove('activo');
    if (elementos.bisagrasNominalInfo) {
        elementos.bisagrasNominalInfo.classList.remove('activo');
        elementos.bisagrasNominalInfo.textContent = 'Introduce altura real primero';
    }
    if (elementos.bisagrasNum) {
        elementos.bisagrasNum.textContent = '—';
        elementos.bisagrasNum.classList.add('inactivo');
    }
    if (elementos.bisagrasMenos) elementos.bisagrasMenos.disabled = true;
    if (elementos.bisagrasmas)   elementos.bisagrasmas.disabled   = true;
    if (elementos.bisagrasMecanizadoPrecio) elementos.bisagrasMecanizadoPrecio.textContent = '';

    const labelEl = document.getElementById('bisagrasLabel');
    if (labelEl) labelEl.classList.add('disabled');
}

// Marco limpio: la vitrina lleva bisagras (para tarifa/informe) pero no se
// mecanizan → sin extras ni cotas. bisagrasTotal se mantiene en su nominal.
function actualizarSinMecanizado(e) {
    state.sinMecanizado = e.target.checked;

    if (state.sinMecanizado) {
        state.bisagrasExtras = 0;
        state.bisagrasTotal  = state.bisagrasCalculadas || state.bisagrasNominal;

        elementos.bisagrasWidget?.classList.remove('activo');
        elementos.bisagrasWidget?.classList.add('deshabilitado');
        if (elementos.bisagrasMenos) elementos.bisagrasMenos.disabled = true;
        if (elementos.bisagrasmas)   elementos.bisagrasmas.disabled   = true;
        if (elementos.bisagrasNominalInfo)
            elementos.bisagrasNominalInfo.textContent = 'Marco limpio — sin mecanizado';
        actualizarPrecioBisagrasExtra();
    } else {
        elementos.bisagrasWidget?.classList.remove('deshabilitado');
        if (state.alturaReal > 0 && state.alturaValido) {
            calcularBisagrasAutomaticas();
        } else {
            resetearWidgetBisagras();
        }
    }

    aplicarEstadoAdjuntarBisagras();
    actualizarResumen();
    validarFormulario();
}

// ==========================================
// ADJUNTAR BISAGRAS (producto) — tri-estado null/true/false
// ==========================================
function setAdjuntarBisagras(valor) {
    state.adjuntarBisagras = valor;
    renderAdjuntarBisagras();
    actualizarResumen();
    validarFormulario();
}

// Pinta el estado visual de los botones Sí/No
function renderAdjuntarBisagras() {
    if (!elementos.adjuntarSi || !elementos.adjuntarNo) return;
    elementos.adjuntarSi.classList.toggle('activo-si', state.adjuntarBisagras === true);
    elementos.adjuntarNo.classList.toggle('activo-no', state.adjuntarBisagras === false);
}

// Aplica condicionantes: bisagras obligatorias (KABI/HAVA/HAVASP) → Sí forzado;
// sin mecanizado → No forzado; en ambos casos deshabilita los botones.
function aplicarEstadoAdjuntarBisagras() {
    const modeloConfig = CONFIG.modelos[state.modelo];
    const bisagrasObligatorias = !!modeloConfig?.bisagras_fijas;

    let bloqueado = false;
    if (bisagrasObligatorias) {
        state.adjuntarBisagras = true;   // bisagras obligatorias → se adjuntan siempre
        bloqueado = true;
    } else if (state.sinMecanizado) {
        state.adjuntarBisagras = false;  // marco limpio → no se adjuntan
        bloqueado = true;
    } else if (state._adjuntarForzado) {
        // Venía de un estado forzado (obligatorio/sin-mec) → exigir respuesta explícita
        state.adjuntarBisagras = null;
    }
    state._adjuntarForzado = bloqueado;

    if (elementos.adjuntarBisagrasGroup)
        elementos.adjuntarBisagrasGroup.classList.toggle('deshabilitado', bloqueado);

    renderAdjuntarBisagras();
}

function cambiarBisagrasExtra(delta) {
    if (state.sinMecanizado) return;
    const modeloConfig = CONFIG.modelos[state.modelo];
    if (modeloConfig?.bisagras_fijas) return;

    const nuevo = state.bisagrasTotal + delta;
    if (nuevo < state.bisagrasNominal || nuevo > state.bisagrasMaxTecnico) return;

    state.bisagrasExtras = nuevo - state.bisagrasNominal;
    state.bisagrasTotal  = nuevo;

    if (elementos.bisagrasNum) elementos.bisagrasNum.textContent = nuevo;
    if (elementos.bisagrasMenos) elementos.bisagrasMenos.disabled = nuevo <= state.bisagrasNominal;
    if (elementos.bisagrasmas)   elementos.bisagrasmas.disabled   = nuevo >= state.bisagrasMaxTecnico;

    actualizarPrecioBisagrasExtra();
    actualizarResumen();
    validarFormulario();
}

// Informativo: coste de mecanizado de las bisagras EXTRA = extras × Mecanizado.
// Solo se muestra si hay extras y no es marco limpio.
function actualizarPrecioBisagrasExtra() {
    if (!elementos.bisagrasMecanizadoPrecio) return;
    if (state.bisagrasExtras > 0 && !state.sinMecanizado) {
        const n = state.bisagrasExtras;
        if (state.precioMecExtra != null) {
            const total = n * state.precioMecExtra;
            elementos.bisagrasMecanizadoPrecio.textContent =
                `${n} mecanizado extra: ${total.toFixed(2)} €`;
        } else {
            elementos.bisagrasMecanizadoPrecio.textContent =
                `${n} mecanizado extra: consultar`;
        }
    } else {
        elementos.bisagrasMecanizadoPrecio.textContent = '';
    }
}

// ==========================================
// ACTUALIZACIÓN DE OPCIONES
// ==========================================
function actualizarCantidad(e) {
    state.cantidad = parseInt(e.target.value) || 1;
    actualizarResumen();
    validarFormulario();
}

function actualizarTirador(e) {
    state.tirador = e.target.checked;

    if (elementos.tiradoresSelector) {
        if (state.tirador) {
            elementos.tiradoresSelector.classList.add('visible');
        } else {
            elementos.tiradoresSelector.classList.remove('visible');
            elementos.tiradoresCards.forEach(card => card.classList.remove('selected'));
            state.tiradorTipo = null;
        }
    }

    actualizarResumen();
    validarFormulario();
}

function seleccionarTirador(card) {
    elementos.tiradoresCards.forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    state.tiradorTipo = card.dataset.tirador;
    actualizarResumen();
    validarFormulario();
}

function actualizarVidrio(e) {
    state.vidrioMontado = e.target.checked;

    if (elementos.colorVidrio) elementos.colorVidrio.disabled = !state.vidrioMontado;
    if (elementos.colorVidrioLabel) {
        elementos.colorVidrioLabel.classList.toggle('disabled', !state.vidrioMontado);
        elementos.colorVidrioLabel.classList.toggle('active-label', state.vidrioMontado);
    }

    if (!state.vidrioMontado) {
        state.colorVidrio = '';
        if (elementos.colorVidrio) elementos.colorVidrio.value = '';
    }

    actualizarCampoVidrioEspecial();
    actualizarResumen();
    validarFormulario();
}

function actualizarColorVidrio(e) {
    state.colorVidrio = e.target.value;
    actualizarCampoVidrioEspecial();
    actualizarResumen();
    validarFormulario();
}

// Muestra el campo de texto solo si el vidrio está montado y es 'especial'; al ocultarlo borra el dato.
function actualizarCampoVidrioEspecial() {
    const esEspecial = state.vidrioMontado && state.colorVidrio === 'especial';
    if (elementos.vidrioEspecialGroup) {
        elementos.vidrioEspecialGroup.style.display = esEspecial ? 'flex' : 'none';
    }
    if (!esEspecial) {
        state.vidrioEspecial = '';
        if (elementos.vidrioEspecial) elementos.vidrioEspecial.value = '';
    }
}

// ==========================================
// ACTUALIZAR RESUMEN LATERAL
// ==========================================
function actualizarResumen() {
    if (elementos.resumenModelo) {
        elementos.resumenModelo.textContent = state.modelo
            ? `${state.modelo} - ${CONFIG.modelos[state.modelo]?.nombre || ''}`
            : '-';
    }

    if (elementos.resumenAcabado) {
        elementos.resumenAcabado.textContent = state.acabado
            ? CONFIG.acabados[state.acabado]?.nombre || '-'
            : '-';
    }

    if (elementos.resumenDimensiones) {
        const altReal = state.alturaReal || '-';
        const ancReal = state.anchoReal || '-';
        elementos.resumenDimensiones.textContent = (altReal !== '-' && ancReal !== '-')
            ? `${altReal} × ${ancReal} mm`
            : '-';
    }

    if (elementos.resumenVidrioMedidas) {
        elementos.resumenVidrioMedidas.textContent =
            (state.vidrioAlto > 0 && state.vidrioAncho > 0)
                ? `${state.vidrioAlto} × ${state.vidrioAncho} mm`
                : '-';
    }

    if (elementos.resumenCantidad) {
        elementos.resumenCantidad.textContent = state.cantidad > 0
            ? `${state.cantidad} unidad${state.cantidad > 1 ? 'es' : ''}`
            : '-';
    }

    actualizarResumenBisagras();

    if (elementos.resumenAdjuntar) {
        elementos.resumenAdjuntar.textContent =
            state.adjuntarBisagras === true  ? 'Sí' :
            state.adjuntarBisagras === false ? 'No'  : '-';
    }

    if (elementos.resumenTirador) {
        let textoTirador = 'No';
        if (state.tirador && state.tiradorTipo) {
            const tirador = CONFIG.tiradores[state.tiradorTipo];
            textoTirador = `Sí (${tirador.medidas})`;
        } else if (state.tirador) {
            textoTirador = 'Sí (sin seleccionar)';
        }
        elementos.resumenTirador.textContent = textoTirador;
    }

    if (elementos.resumenVidrio) {
        let texto = state.vidrioMontado ? 'Sí' : 'No';
        if (state.vidrioMontado && state.colorVidrio) {
            texto += ` (${formatearColorVidrio(state.colorVidrio)})`;
        }
        elementos.resumenVidrio.textContent = texto;
    }
}

function actualizarResumenBisagras() {
    if (!elementos.resumenBisagras) return;

    if (state.sinMecanizado) {
        elementos.resumenBisagras.textContent = 'Sin mecanizar';
    } else {
        elementos.resumenBisagras.textContent = state.bisagrasTotal > 0
            ? state.bisagrasTotal.toString()
            : '-';
    }
}

function formatearColorVidrio(color) {
    return CONFIG.coloresVidrio[color]?.nombre || color;
}

// ==========================================
// VALIDACIÓN DEL FORMULARIO
// ==========================================
function validarFormulario() {
    const bisagrasValidas = state.sinMecanizado || state.bisagrasTotal >= 2;
    const alturaValida    = state.alturaValido !== false && state.alturaReal > 0;
    const anchoValida     = state.anchoValido  !== false && state.anchoReal  > 0;
    const tiradorValido   = !state.tirador || (state.tirador && state.tiradorTipo);
    const vidrioValido    = !state.vidrioMontado || (state.vidrioMontado && state.colorVidrio !== '');
    const adjuntarValido  = state.adjuntarBisagras !== null;   // exige respuesta explícita Sí/No
    // Si se elige especial (acabado o vidrio), el texto es obligatorio.
    const acabadoEspValido = state.acabado !== 'ESP' || state.acabadoEspecial !== '';
    const vidrioEspValido  = state.colorVidrio !== 'especial' || state.vidrioEspecial !== '';

    const completo =
        state.modelo  !== null &&
        state.acabado !== null &&
        alturaValida &&
        anchoValida &&
        state.cantidad >= 1 &&
        bisagrasValidas &&
        adjuntarValido &&
        tiradorValido &&
        vidrioValido &&
        acabadoEspValido &&
        vidrioEspValido;

    if (elementos.btnFabricar) elementos.btnFabricar.disabled = !completo;
}

// ==========================================
// BOTÓN RESET
// ==========================================
function resetearDatos() {
    confirmar('¿Estás seguro de que quieres borrar todos los datos?', ejecutarReset);
}

function ejecutarReset() {
    state.modelo = null;
    actualizarVistaPrevia();
    state.acabado = null;
    state.acabadoEspecial = '';
    state.vidrioEspecial = '';
    state.alturaModulo = 0;
    state.alturaDescuento = 2;
    state.alturaReal = 0;
    state.alturaValido = null;
    state.anchoModulo = 0;
    state.anchoDescuento = 2;
    state.anchoReal = 0;
    state.anchoValido = null;
    state.cantidad = 1;
    state.numPedido = '';
    state.cliente = '';
    state.nota = '';
    state.bisagrasNominal    = 0;
    state.bisagrasExtras     = 0;
    state.bisagrasTotal      = 0;
    state.bisagrasMaxTecnico = 0;
    state.bisagrasCalculadas = 0;
    state.sinMecanizado      = false;
    state.adjuntarBisagras   = null;
    state.tirador = false;
    state.vidrioMontado = false;
    state.colorVidrio = '';
    state.vidrioAlto = 0;
    state.vidrioAncho = 0;

    elementos.modelos.forEach(c => c.classList.remove('selected'));
    elementos.acabados.forEach(i => i.classList.remove('selected'));


    if (elementos.alturaModulo)   elementos.alturaModulo.value = '';
    if (elementos.alturaDescuento) elementos.alturaDescuento.value = '2';
    if (elementos.alturaReal)     elementos.alturaReal.value = '';
    if (elementos.alturaMensaje)  elementos.alturaMensaje.textContent = '';
    if (elementos.anchoModulo)    elementos.anchoModulo.value = '';
    if (elementos.anchoDescuento) elementos.anchoDescuento.value = '2';
    if (elementos.anchoReal)      elementos.anchoReal.value = '';
    if (elementos.anchoMensaje)   elementos.anchoMensaje.textContent = '';
    if (elementos.cantidad)       elementos.cantidad.value = '1';
    if (elementos.numPedido)      elementos.numPedido.value = '';
    if (elementos.cliente)        elementos.cliente.value = '';
    if (elementos.nota)           elementos.nota.value = '';
    if (elementos.notaContador)   elementos.notaContador.textContent = '0 / 250';
    if (elementos.acabadoEspecial) elementos.acabadoEspecial.value = '';
    if (elementos.vidrioEspecial)  elementos.vidrioEspecial.value = '';
    if (elementos.acabadoEspecialGroup) elementos.acabadoEspecialGroup.style.display = 'none';
    if (elementos.vidrioEspecialGroup)  elementos.vidrioEspecialGroup.style.display = 'none';

    if (elementos.sinMecanizado) {
        elementos.sinMecanizado.checked = false;
        elementos.sinMecanizado.disabled = false;
        elementos.sinMecanizado.closest('.checkbox-item')?.classList.remove('disabled');
    }
    elementos.adjuntarBisagrasGroup?.classList.remove('deshabilitado');
    renderAdjuntarBisagras();
    elementos.bisagrasWidget?.classList.remove('deshabilitado');
    resetearWidgetBisagras();

    if (elementos.tirador) elementos.tirador.checked = false;
    if (elementos.tiradoresSelector) elementos.tiradoresSelector.classList.remove('visible');
    elementos.tiradoresCards.forEach(card => card.classList.remove('selected'));
    state.tiradorTipo = null;

    // Restaurar tirador (puede haber quedado bloqueado por modelo previo)
    const tiradorLabel = elementos.tirador?.closest('label');
    if (tiradorLabel) {
        tiradorLabel.classList.remove('disabled');
        if (elementos.tirador) elementos.tirador.disabled = false;
    }

    if (elementos.vidrioMontado) {
        elementos.vidrioMontado.checked = false;
        elementos.vidrioMontado.dispatchEvent(new Event('change'));
    }
    actualizarDisponibilidadVidrio(false);

    // Invalidar la firma de fabricación: la próxima entrada recalculará
    // la hoja desde cero (fabFirma vive en fabricacion.js).
    if (typeof fabFirma !== 'undefined') fabFirma = null;

    actualizarResumen();
    validarFormulario();
}

// ==========================================
// INICIAR APLICACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', init);
