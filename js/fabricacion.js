// ==========================================
// ESTADO DE FABRICACIÓN
// ==========================================
const fabState = {
    mano:        null,   // 'izquierda' | 'derecha'
    tiradorPos:  null,   // 'opuesto' | 'arriba' | 'abajo'
    tiradorZ:    null,   // mm
    b1:          100,
    b2:          100,
    csEditables: [],     // valores de C1, C2, ... Cn-1 (Cn es automático)
    // Bisagras adjuntadas (solo si state.adjuntarBisagras === true)
    bisMontaje:  null,   // 'recta' | 'acodada' | 'superacodada'
    bisBase:     null,   // '16' | '19'
    bisColor:    null    // 'negro' | 'niquelado'
};

// Firma del form principal con la que se calculó la hoja de fabricación
// actual. Se compara al reentrar: si el usuario cambió algún campo que
// alimenta la fabricación, la hoja se invalida y se recalcula desde cero.
// null = todavía no se ha entrado a fabricación (o se reseteó todo).
let fabFirma = null;

// Campos de `state` que, al cambiar, invalidan la hoja de fabricación.
// (numPedido/cliente no afectan al reparto físico y quedan fuera a propósito.)
const FAB_CAMPOS_FIRMA = [
    'modelo', 'acabado', 'acabadoEspecial', 'alturaReal', 'anchoReal',
    'bisagrasTotal', 'adjuntarBisagras',
    'tirador', 'tiradorTipo',
    'vidrioMontado', 'colorVidrio', 'vidrioEspecial', 'cantidad'
];

function calcularFirmaFab() {
    return FAB_CAMPOS_FIRMA.map(k => `${k}:${state[k]}`).join('|');
}

// ==========================================
// HELPERS DE CÁLCULO
// ==========================================

function calcularCsDefault() {
    const gaps = state.bisagrasTotal - 1;
    if (gaps <= 1) return [];
    const total = state.alturaReal - fabState.b1 - fabState.b2;

    // Reparto equidistante real: todos los C lo más iguales posible.
    // Los C editables (C1..Cn-1) llevan el valor base; el céntimo sobrante
    // lo recoge Cn al cerrar la suma (mismo comportamiento que al editar).
    const totalCent = Math.round(total * 100);
    const baseCent  = Math.floor(totalCent / gaps);

    // Solo devolvemos C1..Cn-1 (el último, Cn, lo calcula calcularCn).
    const result = [];
    for (let i = 0; i < gaps - 1; i++) result.push(baseCent / 100);
    return result;
}

// Cn es el valor calculado: cierra la suma y es siempre el último.
// Se redondea a 2 decimales para que el valor mostrado y el usado
// en dibujo/exportación coincidan exactamente.
function calcularCn() {
    const sumCsEdit = fabState.csEditables.reduce((a, b) => a + b, 0);
    return r2(state.alturaReal - fabState.b1 - fabState.b2 - sumCsEdit);
}

// Formateo para VISUALIZACIÓN: 2 decimales fijos + coma (convención ES).
function fmt(v) { return r2(v).toFixed(2).replace('.', ','); }

// Parseo de entrada: acepta coma o punto → número JS.
function parseNum(str) { return parseFloat(String(str).replace(',', '.')); }

// Posiciones en px para el SVG con B1/B2 fijos (no escalados)
// igual que fr y bisR — el dibujo no es proporcional pero siempre es legible
const B_MIN_PX = 40;  // px mínimos reservados para B1 y B2 en el dibujo

function getBisagraPxPositions(dY, dH) {
    const n = state.bisagrasTotal;
    if (n <= 0) return [];

    if (n === 1) return [dY + B_MIN_PX];

    const innerH   = dH - B_MIN_PX - B_MIN_PX;
    const cn       = calcularCn();
    const allCs    = [...fabState.csEditables, cn];   // Cn al final
    const totalMm  = allCs.reduce((a, b) => a + b, 0);

    const pos = [dY + B_MIN_PX];
    for (let i = 0; i < allCs.length - 1; i++) {
        const cPx = totalMm > 0 ? (allCs[i] / totalMm) * innerH : innerH / allCs.length;
        pos.push(pos[pos.length - 1] + cPx);
    }
    pos.push(dY + dH - B_MIN_PX);
    return pos;
}

function getTiradorLado() {
    if (!fabState.tiradorPos || !fabState.mano) return null;
    if (fabState.tiradorPos === 'opuesto') {
        return fabState.mano === 'izquierda' ? 'derecha' : 'izquierda';
    }
    return fabState.tiradorPos;
}

function calcularZDefault() {
    if (!fabState.tiradorPos) return null;
    return fabState.tiradorPos === 'opuesto'
        ? Math.round(state.alturaReal / 2)
        : Math.round(state.anchoReal  / 2);
}

// ==========================================
// ENTRAR / SALIR DE LA VISTA
// ==========================================

// Reinicia la hoja de fabricación a sus valores por defecto a partir
// del state actual del form principal.
function resetearFabState() {
    // Mano por defecto: derecha (bisagras derecha, tirador izquierda)
    fabState.mano = 'derecha';
    fabState.b1 = CONFIG.bisagras_B1_defecto;
    fabState.b2 = CONFIG.bisagras_B2_defecto;
    fabState.csEditables = calcularCsDefault();

    // Tirador por defecto: la primera posición que QUEPA, en orden
    // opuesto → arriba → abajo. Preseleccionar siempre 'opuesto' dejaba
    // marcada una posición imposible en puertas de poca altura.
    if (state.tirador && state.tiradorTipo) {
        const disp = posicionesTiradorDisponibles();
        fabState.tiradorPos = disp[0] || null;
        fabState.tiradorZ   = calcularZDefault();
    } else {
        fabState.tiradorPos = null;
        fabState.tiradorZ   = null;
    }

    // Bisagras adjuntadas: sin preseleccionar (obligatorias para el PDF).
    // Excepción D35-S: solo existe niquelado → preseleccionado.
    fabState.bisMontaje = null;
    fabState.bisBase    = null;
    fabState.bisColor   = CONFIG.modelos[state.modelo]?.tipobisagra === 'D35-S' ? 'niquelado' : null;
}

function pasarAFabricacion() {
    // Solo reiniciar la hoja de fabricación si el form principal cambió
    // respecto a la última vez que se entró. Si el usuario vuelve atrás sin
    // tocar nada relevante, se conservan mano, cotas, tirador y bisagras.
    const firmaActual = calcularFirmaFab();
    if (fabFirma !== firmaActual) {
        resetearFabState();
        fabFirma = firmaActual;
    }

    // Entrar a fabricación: renderizar y mostrar la vista
    mostrarVista('fab');

    renderFabIzq();
    renderFabSVGs();
    actualizarEstadoPDF();
}

function volverConfigurador() {
    mostrarVista('config');
}

// ==========================================
// NAVEGACIÓN ENTRE VISTAS (fuente única)
// config | fab | presu
// Oculta las tres y muestra una. No toca el estado (state/fabState);
// entrar a fabricación reseteando fabState es responsabilidad de
// pasarAFabricacion, no de esta función.
// ==========================================
function mostrarVista(vista) {
    const mainHeader    = document.getElementById('mainHeader');
    const mainContainer = document.getElementById('mainContainer');
    const fabVista      = document.getElementById('fabVista');
    const presuVista    = document.getElementById('presuVista');
    const presuBarra    = document.getElementById('presu-barra');

    // Ocultar todo
    if (mainHeader)    mainHeader.style.display    = 'none';
    if (mainContainer) mainContainer.style.display = 'none';
    if (fabVista)      fabVista.style.display      = 'none';
    if (presuVista)    presuVista.style.display    = 'none';
    document.body.classList.remove('informe-activo');
    if (presuBarra) presuBarra.classList.remove('visible');

    // Mostrar la vista pedida
    if (vista === 'config') {
        if (mainHeader)    mainHeader.style.display    = '';
        if (mainContainer) mainContainer.style.display = '';
    } else if (vista === 'fab') {
        if (fabVista) fabVista.style.display = 'flex';
    } else if (vista === 'presu') {
        if (presuVista) presuVista.style.display = 'block';
        document.body.classList.add('informe-activo');
        if (presuBarra) presuBarra.classList.add('visible');
    }

    window.scrollTo({ top: 0, behavior: 'instant' });
}

// ==========================================
// COLUMNA IZQUIERDA
// ==========================================
function renderFabIzq() {
    renderFicha();
    renderInputs();
    bindFabInputs();
    renderBisagras();
    bindBisagras();
}

function renderFicha() {
    const m   = CONFIG.modelos[state.modelo];
    const a   = CONFIG.acabados[state.acabado];
    const t   = state.tirador && state.tiradorTipo ? CONFIG.tiradores[state.tiradorTipo] : null;
    const vStr = state.vidrioMontado
        ? (state.colorVidrio ? formatearColorVidrio(state.colorVidrio) : 'Sí')
        : 'No';
    const acabadoEsp = state.acabado === 'ESP' && state.acabadoEspecial;
    const vidrioEsp  = state.colorVidrio === 'especial' && state.vidrioEspecial;

    document.getElementById('fabFicha').innerHTML = `
        <div class="fab-ficha-fila"><span>Modelo</span><strong>${state.modelo} — ${m?.nombre || ''}</strong></div>
        <div class="fab-ficha-fila"><span>Acabado</span><strong>${a?.nombre || '-'}</strong></div>
        ${acabadoEsp ? `<div class="fab-ficha-fila"><span>Acabado especial</span><strong>${state.acabadoEspecial}</strong></div>` : ''}
        <div class="fab-ficha-fila"><span>Alto × Ancho</span><strong>${state.alturaReal} × ${state.anchoReal} mm</strong></div>
        <div class="fab-ficha-fila"><span>Medida vidrio</span><strong>${state.vidrioAlto} × ${state.vidrioAncho} mm</strong></div>
        <div class="fab-ficha-fila"><span>Cantidad</span><strong>${state.cantidad} ud.</strong></div>
        <div class="fab-ficha-fila"><span>Bisagras</span><strong>${state.bisagrasTotal}</strong></div>
        ${t ? `<div class="fab-ficha-fila"><span>Tirador</span><strong>${t.medidas}</strong></div>` : ''}
        <div class="fab-ficha-fila"><span>Vidrio</span><strong>${vStr}</strong></div>
        ${vidrioEsp ? `<div class="fab-ficha-fila"><span>Vidrio especial</span><strong>${state.vidrioEspecial}</strong></div>` : ''}
    `;
}

function renderInputs() {
    const n    = state.bisagrasTotal;
    const cn   = calcularCn();
    const tieneTirador = state.tirador && state.tiradorTipo;
    const bisagrasFijas = !!CONFIG.modelos[state.modelo]?.bisagras_fijas;
    const sinMec = state.sinMecanizado;

    // Cn automático (último C — absorbe redondeo)
    const cnOk = cn >= CONFIG.bisagras_C_minimo;
    const cnField = `
        <div class="fab-input-grupo">
            <label>C${n - 1} <span class="fab-hint">(auto)</span>
                <div class="fab-mm-row">
                    <input type="text" id="fabCn" value="${fmt(cn)}"
                        class="${cnOk ? '' : 'fab-err'}" readonly>
                    <span>mm</span>
                </div>
            </label>
            <span class="fab-warn${cnOk ? '' : ' visible'}" id="fabCnWarn">
                ⚠ Mínimo ${CONFIG.bisagras_C_minimo} mm — ajusta B1, B2 o los otros C
            </span>
        </div>`;

    // C1..Cn-1 editables
    let cEditables = '';
    for (let i = 0; i < fabState.csEditables.length; i++) {
        const cOk = fabState.csEditables[i] >= CONFIG.bisagras_C_minimo;
        cEditables += `
            <div class="fab-input-grupo">
                <label>C${i + 1}
                    <div class="fab-mm-row">
                        <input type="text" inputmode="decimal" id="fabC${i + 1}" class="fab-c-edit${cOk ? '' : ' fab-err'}"
                            data-cidx="${i}" value="${fmt(fabState.csEditables[i])}">
                        <span>mm</span>
                    </div>
                </label>
            </div>`;
    }

    // Sección cotas bisagras — título siempre visible, contenido según modelo
    const secCotas = sinMec ? `
        <div class="fab-separador"></div>
        <div class="fab-grupo-label">Cotas de bisagras</div>
        <p class="fab-hint" style="margin:6px 0 0;font-style:italic;">
            Marco limpio — sin mecanizado de bisagras</p>`
    : `
        <div class="fab-separador"></div>
        ${bisagrasFijas
            ? `<div class="fab-grupo-label">Cotas de bisagras</div>
               <p class="fab-hint" style="margin:6px 0 0;font-style:italic;">
                Este modelo tiene posición de bisagras fija</p>`
            : `<div style="display:flex;align-items:center;gap:8px;">
                <span class="fab-grupo-label" style="margin:0">Cotas de bisagras</span>
                <button type="button" class="btn-help" onclick="toggleHelp(this)">?</button>
               </div>
               <div class="fab-input-grupo">
                <label>B1 <span class="fab-hint">sup. (mín. 70)</span>
                    <div class="fab-mm-row">
                        <input type="text" inputmode="decimal" id="fabB1" value="${fmt(fabState.b1)}">
                        <span>mm</span>
                    </div>
                </label>
            </div>

            ${cEditables}
            ${cnField}

            <div class="fab-input-grupo">
                <label>B2 <span class="fab-hint">inf. (mín. 70)</span>
                    <div class="fab-mm-row">
                        <input type="text" inputmode="decimal" id="fabB2" value="${fmt(fabState.b2)}">
                        <span>mm</span>
                    </div>
                </label>
            </div>`
        }`;

    // Sección tirador
    let secTirador = '';
    if (tieneTirador) {
        // Solo se ofrecen las posiciones en que el tirador cabe: 'opuesto' va
        // en vertical (manda la altura), 'arriba'/'abajo' en horizontal (ancho).
        const posDisp = posicionesTiradorDisponibles();
        const posBtns = [
            { id: 'opuesto', label: fabState.mano === 'izquierda' ? '→ Derecha' : '← Izquierda' },
            { id: 'arriba',  label: '↑ Arriba' },
            { id: 'abajo',   label: '↓ Abajo'  }
        ].filter(op => posDisp.includes(op.id)).map(op =>
            `<button class="fab-pos-btn${fabState.tiradorPos === op.id ? ' selected' : ''}"
                data-pos="${op.id}">${op.label}</button>`
        ).join('');

        // Nota de las posiciones descartadas, para que no parezca un fallo.
        const dimMin = tiradorDimMin(state.tiradorTipo);
        const notaPos = posDisp.length === 3 ? '' :
            `<p class="fab-hint" style="margin:6px 0 0;">` +
            (posDisp.length === 0
                ? `Ningún lado admite este tirador: necesita ${dimMin} mm.`
                : `Solo se muestran los lados de ${dimMin} mm o más.`) +
            `</p>`;

        const zVisible = fabState.tiradorPos !== null;
        const zLabel   = fabState.tiradorPos === 'opuesto'
            ? 'Z — desde abajo'
            : 'Z — desde izquierda';
        // Z se mide al CENTRO del tirador: mismo margen arriba que abajo.
        const zMin = tiradorZMin(state.tiradorTipo);
        const zMax = (fabState.tiradorPos === 'opuesto' ? state.alturaReal : state.anchoReal) - zMin;

        secTirador = `
            <div class="fab-separador"></div>
            <div class="fab-grupo-label">Posición del tirador</div>
            <div class="fab-pos-btns">${posBtns}</div>${notaPos}
            <div class="fab-input-grupo" id="fabZGroup" style="display:${zVisible ? 'block' : 'none'}">
                <label>${zLabel}
                    <div class="fab-mm-row">
                        <input type="number" id="fabTiradorZ"
                            value="${fabState.tiradorZ ?? ''}" min="${zMin}" max="${zMax}" step="5">
                        <span>mm</span>
                    </div>
                </label>
            </div>`;
    } else {
        secTirador = `
            <div class="fab-separador"></div>
            <div class="fab-grupo-label">Cotas tirador</div>
            <p style="margin:6px 0 0;font-size:0.95rem;font-weight:600;color:#2D3A4B;">
                Sin tirador mecanizado</p>`;
    }

    document.getElementById('fabInputs').innerHTML = `
        <div class="fab-grupo-label">Lado de las bisagras</div>
        <div class="fab-mano-btns">
            <button class="fab-mano-btn${fabState.mano === 'izquierda' ? ' selected' : ''}"
                data-mano="izquierda">Izquierda</button>
            <button class="fab-mano-btn${fabState.mano === 'derecha' ? ' selected' : ''}"
                data-mano="derecha">Derecha</button>
        </div>

        ${secCotas}
        ${secTirador}
    `;

    // Sincronizar borde rojo de todos los C y el mensaje único al entrar/re-render
    // (cubre el caso de reparto por defecto con algún C < mínimo). El guard interno
    // de actualizarCn ignora los modos sin cotas (fija / marco limpio).
    if (!sinMec && !bisagrasFijas && state.bisagrasTotal > 1) actualizarCn();
}

// Devuelve el largo real del tirador activo en mm (primer número de la string de medidas)
// Largo REAL de fabricación (CONFIG.tiradores[x].largoMm). No parsear 'medidas':
// ahí el primer número es la sección (37, 48), no el largo del corte (150).
function getTiradorLargoMm() {
    return CONFIG.tiradores[state.tiradorTipo]?.largoMm || 126;
}

// Posiciones en que cabe el tirador con las medidas actuales.
function posicionesTiradorDisponibles() {
    if (!state.tiradorTipo) return [];
    return tiradorPosicionesValidas(state.tiradorTipo, state.alturaReal, state.anchoReal);
}

function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

// Largo del tirador EN EL DIBUJO: px fijos, no escalados. Se acota al 60 % del
// lado en que se apoya para que no lo desborde en puertas muy estrechas.
const TIRADOR_PX = 40;
function tiradorLargoPx(lado, dW, dH) {
    const ladoUtil = (lado === 'arriba' || lado === 'abajo') ? dW : dH;
    return Math.min(TIRADOR_PX, ladoUtil * 0.6);
}

// Redondeo a 2 decimales (evita 100.00000001 de coma flotante)
function r2(v) { return Math.round(v * 100) / 100; }

// Los inputs de cotas se corrigen por código cuando el valor queda fuera de
// rango. NO se usa 'change': el navegador lo dispara comparando con el último
// valor que confirmó el USUARIO, no con el que escribimos nosotros, así que al
// reescribir el mismo valor inválido no vuelve a dispararse y la casilla se
// queda con el número incorrecto.
// 'blur' se dispara siempre al salir del campo → un único camino, sin estado
// oculto del navegador. Enter fuerza el blur para que también valide al pulsarlo.
function onCotaChange(el, handler) {
    if (!el) return;
    el.addEventListener('blur', handler);
    el.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
    });
}

function bindFabInputs() {
    document.querySelectorAll('.fab-mano-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            fabState.mano = btn.dataset.mano;
            renderInputs();
            bindFabInputs();
            renderFabSVGs();
        });
    });

    onCotaChange(document.getElementById('fabB1'), e => {
        const gaps   = state.bisagrasTotal - 1;
        const maxB1  = state.alturaReal - CONFIG.bisagras_B_minimo - gaps * CONFIG.bisagras_C_minimo;
        fabState.b1  = r2(clamp(parseNum(e.target.value) || CONFIG.bisagras_B_minimo,
                             CONFIG.bisagras_B_minimo, maxB1));
        e.target.value = fmt(fabState.b1);
        actualizarCn();
        renderFabSVGs();
    });

    onCotaChange(document.getElementById('fabB2'), e => {
        const gaps   = state.bisagrasTotal - 1;
        const maxB2  = state.alturaReal - CONFIG.bisagras_B_minimo - gaps * CONFIG.bisagras_C_minimo;
        fabState.b2  = r2(clamp(parseNum(e.target.value) || CONFIG.bisagras_B_minimo,
                             CONFIG.bisagras_B_minimo, maxB2));
        e.target.value = fmt(fabState.b2);
        actualizarCn();
        renderFabSVGs();
    });

    document.querySelectorAll('.fab-c-edit').forEach(input => {
        onCotaChange(input, e => {
            const idx   = parseInt(e.target.dataset.cidx);
            const gaps  = state.bisagrasTotal - 1;
            // Máximo: deja al menos C_minimo para cada uno de los demás gaps
            const otrosCs = fabState.csEditables.reduce((s, v, i) => i === idx ? s : s + v, 0);
            const maxC  = state.alturaReal - fabState.b1 - fabState.b2
                          - otrosCs - CONFIG.bisagras_C_minimo; // al menos C_minimo para Cn
            fabState.csEditables[idx] = r2(clamp(parseNum(e.target.value) || CONFIG.bisagras_C_minimo,
                                              CONFIG.bisagras_C_minimo, maxC));
            e.target.value = fmt(fabState.csEditables[idx]);
            actualizarCn();
            renderFabSVGs();
        });
    });

    document.querySelectorAll('.fab-pos-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            fabState.tiradorPos = btn.dataset.pos;
            fabState.tiradorZ   = calcularZDefault();
            renderInputs();
            bindFabInputs();
            renderFabSVGs();
        });
    });

    onCotaChange(document.getElementById('fabTiradorZ'), e => {
        const zMin   = tiradorZMin(state.tiradorTipo);
        const maxDim = fabState.tiradorPos === 'opuesto' ? state.alturaReal : state.anchoReal;
        fabState.tiradorZ = clamp(parseInt(e.target.value) || zMin, zMin, maxDim - zMin);
        renderFabSVGs();
        e.target.value = fabState.tiradorZ;   // se escribe al final: la casilla
                                              // siempre refleja el valor guardado
    });
}

function actualizarCn() {
    const Cmin = CONFIG.bisagras_C_minimo;
    const cn   = calcularCn();

    // Repintar Cn (auto)
    const cnEl = document.getElementById('fabCn');
    if (!cnEl) return;
    cnEl.value = fmt(cn);
    const cnOk = cn >= Cmin;
    cnEl.classList.toggle('fab-err', !cnOk);

    // Repintar cada C editable: borde rojo si < mínimo
    let algunCbajo = !cnOk;
    fabState.csEditables.forEach((c, i) => {
        const el = document.getElementById(`fabC${i + 1}`);
        if (!el) return;
        const ok = c >= Cmin;
        el.classList.toggle('fab-err', !ok);
        if (!ok) algunCbajo = true;
    });

    // Mensaje único bajo Cn: señaliza si CUALQUIER C está por debajo del mínimo
    const warnEl = document.getElementById('fabCnWarn');
    if (warnEl) warnEl.classList.toggle('visible', algunCbajo);

    // Re-evaluar el bloqueo de PDF/presupuesto: un C < mínimo debe impedir generar
    actualizarEstadoPDF();
}

// ==========================================
// SVG HELPERS
// ==========================================
const C_FRAME = '#2D3A4B';
const C_DIM   = '#1a1a1a';
const C_TIR   = '#1a1a2e';

function svgDoorFrame(dX, dY, dW, dH, fr, svgId) {
    const glassFill = state.vidrioMontado ? `url(#glassGrad_${svgId})` : 'white';
    const glassDef  = state.vidrioMontado ? `
        <defs>
            <linearGradient id="glassGrad_${svgId}" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%"   stop-color="#d6eaf8" stop-opacity="0.9"/>
                <stop offset="45%"  stop-color="#ebf5fb" stop-opacity="0.6"/>
                <stop offset="70%"  stop-color="#aed6f1" stop-opacity="0.75"/>
                <stop offset="100%" stop-color="#85c1e9" stop-opacity="0.55"/>
            </linearGradient>
        </defs>` : '';
    return `${glassDef}
        <rect x="${dX}" y="${dY}" width="${dW}" height="${dH}"
              fill="#b0bec5" stroke="${C_FRAME}" stroke-width="2"/>
        <line x1="${dX}"      y1="${dY}"      x2="${dX+fr}"     y2="${dY+fr}"
              stroke="${C_FRAME}" stroke-width="1.5"/>
        <line x1="${dX+dW}"   y1="${dY}"      x2="${dX+dW-fr}"  y2="${dY+fr}"
              stroke="${C_FRAME}" stroke-width="1.5"/>
        <line x1="${dX}"      y1="${dY+dH}"   x2="${dX+fr}"     y2="${dY+dH-fr}"
              stroke="${C_FRAME}" stroke-width="1.5"/>
        <line x1="${dX+dW}"   y1="${dY+dH}"   x2="${dX+dW-fr}"  y2="${dY+dH-fr}"
              stroke="${C_FRAME}" stroke-width="1.5"/>
        <rect x="${dX+fr}" y="${dY+fr}" width="${dW-2*fr}" height="${dH-2*fr}"
              fill="${glassFill}" stroke="#aaa" stroke-width="0.8"/>`;
}

// Bisagras tipo escuadra (HAVA / HAVASP)
// Polígono L cerrado, relleno blanco, borde negro
// off  = separación del borde exterior del perfil
// eL   = longitud de cada brazo (más largo que el grosor)
// eW   = grosor del brazo (prop. 20mm/45mm — no cambia)
function svgBisagrasEsquina(dX, dY, dW, dH, fr, bisLado) {
    const eW  = fr * (20 / 70);        // grosor brazo — fijo (prop. 20mm/70mm)
    const eL  = fr * 1;             // longitud brazo — más largo
    const off = fr * 0.20;             // separación del borde exterior
    const eSW = Math.max(1.5, fr * 0.12);

    function lPoly(corner) {
        let pts;
        if (corner === 'tl') pts = [
            [dX+off+eL,  dY+off     ],
            [dX+off,     dY+off     ],   // vértice
            [dX+off,     dY+off+eL  ],
            [dX+off+eW,  dY+off+eL  ],
            [dX+off+eW,  dY+off+eW  ],   // ángulo interior
            [dX+off+eL,  dY+off+eW  ],
        ];
        else if (corner === 'tr') pts = [
            [dX+dW-off-eL,  dY+off     ],
            [dX+dW-off,     dY+off     ],   // vértice
            [dX+dW-off,     dY+off+eL  ],
            [dX+dW-off-eW,  dY+off+eL  ],
            [dX+dW-off-eW,  dY+off+eW  ],   // ángulo interior
            [dX+dW-off-eL,  dY+off+eW  ],
        ];
        else if (corner === 'bl') pts = [
            [dX+off+eL,  dY+dH-off     ],
            [dX+off,     dY+dH-off     ],   // vértice
            [dX+off,     dY+dH-off-eL  ],
            [dX+off+eW,  dY+dH-off-eL  ],
            [dX+off+eW,  dY+dH-off-eW  ],   // ángulo interior
            [dX+off+eL,  dY+dH-off-eW  ],
        ];
        else /* br */ pts = [
            [dX+dW-off-eL,  dY+dH-off     ],
            [dX+dW-off,     dY+dH-off     ],   // vértice
            [dX+dW-off,     dY+dH-off-eL  ],
            [dX+dW-off-eW,  dY+dH-off-eL  ],
            [dX+dW-off-eW,  dY+dH-off-eW  ],   // ángulo interior
            [dX+dW-off-eL,  dY+dH-off-eW  ],
        ];
        const pStr = pts.map(p => p.join(',')).join(' ');
        return `<polygon points="${pStr}"
            fill="white" stroke="#111" stroke-width="${eSW}" stroke-linejoin="miter"/>`;
    }

    if (bisLado === 'izquierda') {
        return lPoly('tl') + lPoly('bl');
    } else {
        return lPoly('tr') + lPoly('br');
    }
}

function svgText(x, y, txt, sz, color, bold) {
    return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle"
        font-family="Arial,sans-serif" font-size="${sz}" fill="${color}"
        font-weight="${bold ? 'bold' : 'normal'}">${txt}</text>`;
}

// showValue=false → muestra nombre pero no el valor numérico
function svgDimV(x, y1, y2, name, value, side, showValue = true) {
    const arw  = 7;    // flechas más grandes
    const gap  = 8;
    // Normalizar para que top < bot siempre (evita flechas invertidas)
    const top  = Math.min(y1, y2);
    const bot  = Math.max(y1, y2);
    const midY = (top + bot) / 2;
    const pxH  = bot - top;
    const tx   = side === 'left' ? x - gap : x + gap;
    const anch = side === 'left' ? 'end' : 'start';

    let s = `<line x1="${x}" y1="${top}" x2="${x}" y2="${bot}"
        stroke="${C_DIM}" stroke-width="1.2"/>`;
    // Flecha superior apunta hacia ARRIBA (hacia fuera de la cota)
    s += `<polygon points="${x},${top} ${x-arw/2},${top+arw*1.4} ${x+arw/2},${top+arw*1.4}"
        fill="${C_DIM}"/>`;
    // Flecha inferior apunta hacia ABAJO (hacia fuera de la cota)
    s += `<polygon points="${x},${bot} ${x-arw/2},${bot-arw*1.4} ${x+arw/2},${bot-arw*1.4}"
        fill="${C_DIM}"/>`;

    if (pxH >= 14) {
        if (showValue) {
            if (name) {
                // Nombre arriba, valor abajo
                s += `<text x="${tx}" y="${midY - 6}" text-anchor="${anch}" dominant-baseline="middle"
                    font-family="Arial,sans-serif" font-size="11" fill="${C_DIM}"
                    font-weight="bold">${name}</text>`;
                s += `<text x="${tx}" y="${midY + 7}" text-anchor="${anch}" dominant-baseline="middle"
                    font-family="Arial,sans-serif" font-size="11" fill="${C_DIM}">${value}</text>`;
            } else {
                // Solo valor, centrado
                s += `<text x="${tx}" y="${midY}" text-anchor="${anch}" dominant-baseline="middle"
                    font-family="Arial,sans-serif" font-size="11" fill="${C_DIM}"
                    font-weight="bold">${value}</text>`;
            }
        } else {
            // Solo nombre, sin valor numérico
            s += `<text x="${tx}" y="${midY}" text-anchor="${anch}" dominant-baseline="middle"
                font-family="Arial,sans-serif" font-size="11" fill="${C_DIM}"
                font-weight="bold">${name}</text>`;
        }
    }
    return s;
}

function svgDimH(x1, x2, y, value, above) {
    const arw  = 7;    // flechas más grandes
    const midX = (x1 + x2) / 2;
    const ty   = above ? y - 12 : y + 14;

    let s = `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"
        stroke="${C_DIM}" stroke-width="1.2"/>`;
    // Flecha izquierda apunta hacia fuera (←)
    s += `<polygon points="${x1},${y} ${x1+arw*1.4},${y-arw/2} ${x1+arw*1.4},${y+arw/2}"
        fill="${C_DIM}"/>`;
    // Flecha derecha apunta hacia fuera (→)
    s += `<polygon points="${x2},${y} ${x2-arw*1.4},${y-arw/2} ${x2-arw*1.4},${y+arw/2}"
        fill="${C_DIM}"/>`;
    s += `<text x="${midX}" y="${ty}" text-anchor="middle"
        font-family="Arial,sans-serif" font-size="11" fill="${C_DIM}"
        font-weight="bold">${value}</text>`;
    return s;
}

// ==========================================
// SVG TRASERA
// ==========================================
function generarSVGTrasera() {
    const { alturaReal, anchoReal, bisagrasTotal } = state;
    const { mano, b1, b2 } = fabState;

    const VW = 400, VH = 560;
    const mL = 60, mR = 60, mTop = 65, mBot = 65;
    const availW = VW - mL - mR;
    const availH = VH - mTop - mBot;
    const scale  = Math.min(availW / anchoReal, availH / alturaReal);
    const dW = anchoReal * scale;
    const dH = alturaReal * scale;
    const dX = mL + (availW - dW) / 2;
    const dY = mTop + (availH - dH) / 2;

    const fr = 20;   // grosor visible del perfil en px
    const bisR = 8;  // radio círculo — cabe dentro de fr/2

    const cn    = calcularCn();
    const allCs = bisagrasTotal > 1 ? [...fabState.csEditables, cn] : [];

    let s = `<svg viewBox="0 0 ${VW} ${VH}" xmlns="http://www.w3.org/2000/svg"
        style="width:100%;height:auto;display:block;">`;
    s += `<rect width="${VW}" height="${VH}" fill="white"/>`;
    s += svgDoorFrame(dX, dY, dW, dH, fr, 'trasera');

    if (mano && !state.sinMecanizado) {
        // Trasera: bisagras al lado CONTRARIO de mano
        const bisLado = mano === 'izquierda' ? 'derecha' : 'izquierda';
        // Escuadra en L solo para HAVA/HAVASP (tipobisagra 'HAVA').
        // KABI comparte "bisagra fija a 2" pero se dibuja como círculo (else).
        const esEsquina = CONFIG.modelos[state.modelo]?.tipobisagra === 'HAVA';

        if (esEsquina) {
            // Bisagra tipo escuadra en L — siempre arriba y abajo, sin cotas
            s += svgBisagrasEsquina(dX, dY, dW, dH, fr, bisLado);
        } else {
            // Bisagra tipo círculo con cotas B1/C/B2
            const bisX    = bisLado === 'izquierda' ? dX + fr / 2 : dX + dW - fr / 2;
            const bisPx   = getBisagraPxPositions(dY, dH);
            const dimX    = bisLado === 'izquierda' ? dX - 28 : dX + dW + 28;
            const dimSide = bisLado === 'izquierda' ? 'left'  : 'right';

            bisPx.forEach(py => {
                s += `<circle cx="${bisX}" cy="${py}" r="${bisR}"
                    fill="white" stroke="${C_FRAME}" stroke-width="1.6"/>`;
            });

            s += svgDimV(dimX, dY, bisPx[0], 'B1', 0, dimSide, false);
            for (let i = 0; i < bisPx.length - 1; i++) {
                s += svgDimV(dimX, bisPx[i], bisPx[i+1], `C${i+1}`, 0, dimSide, false);
            }
            s += svgDimV(dimX, bisPx[bisPx.length-1], dY + dH, 'B2', 0, dimSide, false);
        }
    }

    // Cotas Y y X — solo en este dibujo
    const yX    = mano === 'izquierda' ? dX - 30 : dX + dW + 30;
    const ySide = mano === 'izquierda' ? 'left'   : 'right';
    s += svgDimV(yX, dY, dY + dH, '', alturaReal, ySide, true);
    s += svgDimH(dX, dX + dW, dY + dH + 27, anchoReal, false);

    if (!mano) {
        s += svgText(VW/2, VH - 18, 'Selecciona el lado de las bisagras', 9, '#aaa', false);
    }

    s += '</svg>';
    return s;
}

// ==========================================
// SVG FRONTAL
// ==========================================
function generarSVGFrontal() {
    const { alturaReal, anchoReal } = state;

    const VW = 400, VH = 560;
    const mL = 60, mR = 60, mTop = 65, mBot = 65;
    const availW = VW - mL - mR;
    const availH = VH - mTop - mBot;
    const scale  = Math.min(availW / anchoReal, availH / alturaReal);
    const dW = anchoReal * scale;
    const dH = alturaReal * scale;
    const dX = mL + (availW - dW) / 2;
    const dY = mTop + (availH - dH) / 2;

    const fr = 20;
    const lado = getTiradorLado();
    // El croquis NO está a escala: representa los elementos que intervienen.
    // El grosor de perfil (fr), los círculos de bisagra (bisR) y el tirador se
    // dibujan en PÍXELES FIJOS para que se lean bien, iguales para los tres
    // tiradores y para cualquier medida. Solo las cotas numéricas son reales.
    // No usar aquí getTiradorLargoMm() ni multiplicar por scale: ese valor es
    // para cálculo (cota Z y límites). Mismo criterio en pdfVitrinas.js.
    const TL   = tiradorLargoPx(lado, dW, dH);
    const TG   = 9;           // grosor visual fijo

    let tiradorSVG = '';
    let zDimSVG    = '';

    if (lado && fabState.tiradorZ) {
        let tx, ty, tw, th;

        if (lado === 'derecha') {
            const yc = dY + (alturaReal - fabState.tiradorZ) * scale;
            tx = dX + dW - TG / 2; ty = yc - TL / 2; tw = TG; th = TL;
            zDimSVG = svgDimV(dX + dW + TG/2 + 22, dY + dH, yc, '', fabState.tiradorZ, 'right', true);
        } else if (lado === 'izquierda') {
            const yc = dY + (alturaReal - fabState.tiradorZ) * scale;
            tx = dX - TG / 2; ty = yc - TL / 2; tw = TG; th = TL;
            zDimSVG = svgDimV(dX - TG/2 - 22, dY + dH, yc, '', fabState.tiradorZ, 'left', true);
        } else if (lado === 'arriba') {
            const xc = dX + fabState.tiradorZ * scale;
            tx = xc - TL / 2; ty = dY - TG / 2; tw = TL; th = TG;
            zDimSVG = svgDimH(dX, xc, dY - TG/2 - 22, fabState.tiradorZ, true);
        } else if (lado === 'abajo') {
            const xc = dX + fabState.tiradorZ * scale;
            tx = xc - TL / 2; ty = dY + dH - TG / 2; tw = TL; th = TG;
            zDimSVG = svgDimH(dX, xc, dY + dH + TG/2 + 22, fabState.tiradorZ, false);
        }

        tiradorSVG = `<rect x="${tx}" y="${ty}" width="${tw}" height="${th}"
            fill="${C_TIR}" rx="2.5"/>`;
    }

    let s = `<svg viewBox="0 0 ${VW} ${VH}" xmlns="http://www.w3.org/2000/svg"
        style="width:100%;height:auto;display:block;">`;
    s += `<rect width="${VW}" height="${VH}" fill="white"/>`;
    s += svgDoorFrame(dX, dY, dW, dH, fr, 'frontal');
    s += tiradorSVG;
    s += zDimSVG;
    // Y y X solo en el dibujo trasera

    if (!lado) {
        const msg = state.tirador && state.tiradorTipo
            ? 'Selecciona mano y posición del tirador'
            : 'Sin tirador mecanizado';
        const msgSz    = (state.tirador && state.tiradorTipo) ? 9 : 13;
        const msgColor = (state.tirador && state.tiradorTipo) ? '#aaa' : '#2D3A4B';
        const msgBold  = !(state.tirador && state.tiradorTipo);
        s += svgText(VW/2, VH - 16, msg, msgSz, msgColor, msgBold);
    }

    s += '</svg>';
    return s;
}

// ==========================================
// COLUMNA BISAGRAS (producto adjuntado)
// ==========================================
function renderBisagras() {
    const cont = document.getElementById('fabBisagras');
    if (!cont) return;

    // No se adjuntan: mantener el bloque en su sitio con mensaje
    if (state.adjuntarBisagras !== true) {
        cont.innerHTML = `
            <div class="fab-grupo-label">Bisagras</div>
            <div class="fab-bis-noadj">No adjuntamos</div>`;
        return;
    }

    const tipoBis = CONFIG.modelos[state.modelo]?.tipobisagra;

    // Estado 3 — KABI/HAVA: posición fija, nada que seleccionar. Solo informar.
    // Datos ya decididos en el formulario anterior (modelo + acabado).
    if (tipoBis === 'KABI' || tipoBis === 'HAVA') {
        const nombreBis = 'Bisagra ' + tipoBis;
        const imgBis    = CONFIG.bisagras.imagenesFijas[tipoBis];
        const acabado   = CONFIG.acabados[state.acabado]?.nombre || '-';
        cont.innerHTML = `
            <div class="fab-grupo-label">Montaje de bisagra</div>
            <div class="fab-ficha">
                <div class="fab-ficha-fila"><span>Modelo</span><strong>${nombreBis}</strong></div>
                <div class="fab-ficha-fila"><span>Acabado</span><strong>${acabado}</strong></div>
            </div>
            <img class="fab-bis-base-img" src="${imgBis}" alt="${nombreBis}" onerror="this.style.display='none'">`;
        return;
    }

    const M = CONFIG.bisagras.montajes;
    const cardsMontaje = Object.keys(M).map(id => `
        <div class="fab-bis-card${fabState.bisMontaje === id ? ' selected' : ''}" data-bismontaje="${id}">
            <img src="${M[id].imagen}" alt="${M[id].nombre}" onerror="this.style.display='none'">
            <span class="fab-bis-card-nombre">${M[id].nombre}</span>
        </div>`).join('');

    const B = CONFIG.bisagras.bases;
    const btnsBase = Object.keys(B).map(id => `
        <button type="button" class="${fabState.bisBase === id ? 'selected' : ''}" data-bisbase="${id}">${B[id].nombre}</button>`).join('');

    // D35-S solo existe en niquelado → ocultar botón negro (no bloquear)
    const C = CONFIG.bisagras.colores;
    const coloresDisponibles = tipoBis === 'D35-S'
        ? Object.keys(C).filter(id => id !== 'negro')
        : Object.keys(C);
    const btnsColor = coloresDisponibles.map(id => `
        <button type="button" class="${fabState.bisColor === id ? 'selected' : ''}" data-biscolor="${id}">${C[id].nombre}</button>`).join('');

    cont.innerHTML = `
        <div class="fab-bis-titulo-row">
            <span class="fab-grupo-label" style="margin:0">Montaje de bisagra</span>
            <button type="button" class="fab-bis-zoom" id="fabBisZoom">🔍 Zoom</button>
        </div>
        <div class="fab-bis-cards">${cardsMontaje}</div>

        <div class="fab-grupo-label">Base — para costado de:</div>
        <img class="fab-bis-base-img" src="${CONFIG.bisagras.imagenBasePorCota[fabState.bisBase] || CONFIG.bisagras.imagenBasePorCota['16']}" alt="Base bisagra" onerror="this.style.display='none'">
        <div class="fab-bis-toggle">${btnsBase}</div>

        <div class="fab-grupo-label">Color de bisagras</div>
        <div class="fab-bis-toggle">${btnsColor}</div>`;
}

function bindBisagras() {
    document.querySelectorAll('[data-bismontaje]').forEach(el => {
        el.addEventListener('click', () => {
            fabState.bisMontaje = el.dataset.bismontaje;
            renderBisagras(); bindBisagras();
            actualizarEstadoPDF();
        });
    });
    document.querySelectorAll('[data-bisbase]').forEach(el => {
        el.addEventListener('click', () => {
            fabState.bisBase = el.dataset.bisbase;
            renderBisagras(); bindBisagras();
            actualizarEstadoPDF();
        });
    });
    document.querySelectorAll('[data-biscolor]').forEach(el => {
        el.addEventListener('click', () => {
            fabState.bisColor = el.dataset.biscolor;
            renderBisagras(); bindBisagras();
            actualizarEstadoPDF();
        });
    });
    document.getElementById('fabBisZoom')?.addEventListener('click', abrirZoomMontajes);
}

// Popup con las 3 imágenes de montaje en horizontal
function abrirZoomMontajes() {
    const M = CONFIG.bisagras.montajes;
    const items = Object.keys(M).map(id => `
        <div class="fab-bis-modal-item">
            <img src="${M[id].imagen}" alt="${M[id].nombre}" onerror="this.style.opacity=0.3">
            <span>${M[id].nombre}</span>
        </div>`).join('');

    const overlay = document.createElement('div');
    overlay.className = 'fab-bis-modal-overlay';
    overlay.innerHTML = `
        <div class="fab-bis-modal">
            <h3 class="fab-bis-modal-titulo">Montaje de bisagra</h3>
            <div class="fab-bis-modal-imgs">${items}</div>
            <button type="button" class="fab-bis-modal-cerrar">Cerrar</button>
        </div>`;

    const cerrar = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrar(); });
    overlay.querySelector('.fab-bis-modal-cerrar').addEventListener('click', cerrar);
    document.body.appendChild(overlay);
}

// Bisagras completas: las tres selecciones hechas (o no se adjuntan)
function bisagrasCompletas() {
    if (state.adjuntarBisagras !== true) return true;
    // KABI/HAVA: posición fija, sin selecciones → siempre completas
    const tipoBis = CONFIG.modelos[state.modelo]?.tipobisagra;
    if (tipoBis === 'KABI' || tipoBis === 'HAVA') return true;
    return fabState.bisMontaje && fabState.bisBase && fabState.bisColor;
}

// Reparto de cotas válido: ningún hueco C por debajo del mínimo.
// No aplica a marco limpio (sin mecanizado) ni a bisagras de posición fija.
function cotasValidas() {
    if (state.sinMecanizado) return true;
    if (CONFIG.modelos[state.modelo]?.bisagras_fijas) return true;
    if (state.bisagrasTotal <= 1) return true;
    const Cmin = CONFIG.bisagras_C_minimo;
    const cn = calcularCn();
    if (cn < Cmin) return false;
    return fabState.csEditables.every(c => c >= Cmin);
}

// Habilita/deshabilita el botón de PDF según validez de la captura
function actualizarEstadoPDF() {
    const bisOk   = bisagrasCompletas();
    const cotasOk = cotasValidas();
    const ok = bisOk && cotasOk;

    // Mensaje según qué falla (prioridad: cotas, luego selección de bisagra)
    const titulo = cotasOk
        ? (bisOk ? null : 'Selecciona montaje, base y color de bisagra')
        : `Hay cotas de bisagra por debajo del mínimo (${CONFIG.bisagras_C_minimo} mm)`;

    const btn = document.getElementById('fabBtnPDF');
    if (btn) {
        btn.disabled = !ok;
        btn.title = ok ? 'Generar PDF' : titulo;
    }

    const btnPresu = document.getElementById('fabBtnPresupuesto');
    if (btnPresu) {
        btnPresu.disabled = !ok;
        btnPresu.title = ok ? 'Ver presupuesto' : titulo;
    }

    // Exportar NO se deshabilita: un botón apagado no puede explicar qué falta
    // (Firefox no muestra el title de un botón disabled). Al pulsarlo, el aviso
    // dice qué falta y lleva al configurador si el dato está allí.
    const btnExp = document.getElementById('fabBtnExportar');
    if (btnExp && typeof motivoNoExportar === 'function') {
        const motivo = motivoNoExportar();
        btnExp.title = motivo ? `${motivo} Pulsa para saber más.` : 'Exportar configuración para enviar';
    }
}

// ==========================================
// RENDER AMBOS SVGs
// ==========================================
function renderFabSVGs() {
    document.getElementById('fabSvgTrasera').innerHTML = generarSVGTrasera();
    document.getElementById('fabSvgFrontal').innerHTML = generarSVGFrontal();
}

// ==========================================
// INICIALIZACIÓN
// ==========================================

function inicializarFabricacion() {
    document.getElementById('fabBtnVolver')?.addEventListener('click', volverConfigurador);
    // PDF se gestiona desde pdfVitrinas.js
}


document.addEventListener('DOMContentLoaded', inicializarFabricacion);
