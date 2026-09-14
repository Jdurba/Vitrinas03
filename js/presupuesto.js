// ==========================================
// PRESUPUESTO — Configurador de Vitrinas
//   · Carga de TarifaVitrinas.csv (UTF-8 BOM o ISO-8859-1, ;)
//   · Cálculo por escalones ancho×alto (al alza; se muestra alto×ancho)
//   · Composición de código y denominación Odoo
//   · Vista de presupuesto (pantalla completa)
// ==========================================

// ── Helper de carga: fetch + decodificación + split en líneas ───
// Reutilizado por cargarTarifas() y cargarExtras().
// Codificación automática: UTF-8 con BOM (Excel moderno) o ISO-8859-1 (Excel clásico).
async function cargarCSV(url) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`No se pudo cargar ${url} (HTTP ${resp.status})`);

    const buf   = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const tieneBOM = bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF;
    const texto = new TextDecoder(tieneBOM ? 'utf-8' : 'iso-8859-1').decode(buf);

    return texto.split(/\r?\n/).map(l => l.trim()).filter(l => l !== '');
}

// Normaliza una tarifa en formato ES ("1.128,60") o EN ("128.60") a número.
function parseTarifaES(str) {
    let s = (str || '').trim();
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    return parseFloat(s);
}

// ── Carga y parseo del CSV de tarifas ──────────────────────────
let TARIFAS = null;   // caché de filas parseadas

async function cargarTarifas() {
    if (TARIFAS) return TARIFAS;

    const lineas = await cargarCSV('TarifaVitrinas.csv?v=1');

    // Mapeo por cabecera: el orden de columnas del CSV es libre
    const cab = lineas[0].split(';').map(c => c.trim());
    const col = nombre => cab.indexOf(nombre);
    const iPerfil = col('Perfil'), iAncho = col('Ancho'), iAlto = col('Alto'),
          iTarifa = col('Tarifa'), iVidrio = col('ColorVidrio'), iAcabado = col('Acabado');
    if ([iPerfil, iAncho, iAlto, iTarifa, iVidrio, iAcabado].includes(-1)) {
        throw new Error('Cabecera del CSV incorrecta. Se esperan: Perfil, Ancho, Alto, Tarifa, ColorVidrio, Acabado');
    }

    TARIFAS = lineas
        .slice(1)
        .map(l => {
            const c = l.split(';');
            return {
                perfil:      (c[iPerfil]  || '').trim(),
                ancho:       parseInt(c[iAncho], 10),
                alto:        parseInt(c[iAlto], 10),
                tarifa:      parseTarifaES(c[iTarifa]),
                colorVidrio: (c[iVidrio]  || '').trim(),
                acabado:     (c[iAcabado] || '').trim()
            };
        })
        // Descarta filas corruptas (p.ej. #¡REF! de Excel) o incompletas
        .filter(f => CONFIG.modelos[f.perfil] && !isNaN(f.ancho) && !isNaN(f.alto) && !isNaN(f.tarifa));

    return TARIFAS;
}

// ── Búsqueda de tarifa: escalón al alza ─────────────────────────
function buscarTarifa(perfil, grupoAcabado, grupoVidrio, ancho, alto) {
    const filas = TARIFAS.filter(f =>
        f.perfil === perfil &&
        f.acabado === grupoAcabado &&
        f.colorVidrio === grupoVidrio
    );

    if (filas.length === 0) {
        return { consultar: true, motivo: 'Combinación no disponible en tarifa' };
    }

    const anchos   = [...new Set(filas.map(f => f.ancho))].sort((a, b) => a - b);
    const anchoEsc = anchos.find(a => a >= ancho);
    if (anchoEsc === undefined) {
        return { consultar: true, motivo: `Ancho ${ancho} mm fuera de tarifa (máx. ${anchos[anchos.length - 1]} mm)` };
    }

    const filasAncho = filas.filter(f => f.ancho === anchoEsc);
    const altos      = [...new Set(filasAncho.map(f => f.alto))].sort((a, b) => a - b);
    const altoEsc    = altos.find(a => a >= alto);
    if (altoEsc === undefined) {
        return { consultar: true, motivo: `Alto ${alto} mm fuera de tarifa (máx. ${altos[altos.length - 1]} mm)` };
    }

    const fila = filasAncho.find(f => f.alto === altoEsc);
    return { consultar: false, tarifa: fila.tarifa };
}

// ── Carga y parseo de TarifaExtras.csv ──────────────────────────
// Tiradores, mecanizados, bisagras adjuntadas y bases.
let EXTRAS = null;   // caché de filas parseadas

async function cargarExtras() {
    if (EXTRAS) return EXTRAS;

    const lineas = await cargarCSV('TarifaExtras.csv?v=1');
    const cab = lineas[0].split(';').map(c => c.trim());
    const col = n => cab.indexOf(n);

    const iCod = col('Codigo'), iDen = col('Denominacion'), iTar = col('Tarifa'),
          iFam = col('Familia'), iAca = col('Acabado'), iCol = col('Color'),
          iTipoM = col('TipoMontaje'), iTipoB = col('TipoBisagra'),
          iCos = col('Costado'), iDto = col('Dto');
    if ([iCod, iDen, iTar].includes(-1)) {
        throw new Error('Cabecera de TarifaExtras incorrecta. Mínimo: Codigo, Denominacion, Tarifa');
    }

    EXTRAS = lineas.slice(1).map(l => {
        const c = l.split(';');
        const tarStr = (c[iTar] || '').trim();
        const consultar = /consultar/i.test(tarStr);
        return {
            codigo:       (c[iCod]   || '').trim(),
            denominacion: (c[iDen]   || '').trim(),
            tarifa:       consultar ? 0 : (parseTarifaES(tarStr) || 0),
            consultar,
            familia:      (c[iFam]   || '').trim(),
            acabado:      (c[iAca]   || '').trim(),
            color:        (c[iCol]   || '').trim(),
            tipoMontaje:  (c[iTipoM] || '').trim(),
            tipoBisagra:  (c[iTipoB] || '').trim(),
            costado:      (c[iCos]   || '').trim(),
            dto:          parseInt((c[iDto] || '0').trim(), 10) || 0
        };
    }).filter(f => f.codigo !== '');

    return EXTRAS;
}

// ── Lookup genérico en TarifaExtras ─────────────────────────────
// filtros: columnas a casar. Claves:
//   codigoExacto | codigoPrefijo | familia | acabado | color |
//   tipoMontaje | tipoBisagra | costado.
// tipoBisagra usa match "contiene": la fila 'ALU20/D35' casa con 'ALU20' o 'D35'.
// Devuelve { encontrado, consultar, codigo, denominacion, tarifa, dto }.
function buscarExtra(filtros) {
    const casa = f => {
        if (filtros.codigoExacto  && f.codigo !== filtros.codigoExacto) return false;
        if (filtros.codigoPrefijo && !f.codigo.startsWith(filtros.codigoPrefijo + '.')) return false;
        if (filtros.familia     !== undefined && f.familia     !== filtros.familia)     return false;
        if (filtros.acabado     !== undefined && f.acabado     !== filtros.acabado)     return false;
        if (filtros.color       !== undefined && f.color       !== filtros.color)       return false;
        if (filtros.tipoMontaje !== undefined && f.tipoMontaje !== filtros.tipoMontaje) return false;
        if (filtros.tipoBisagra !== undefined && !f.tipoBisagra.split('/').includes(filtros.tipoBisagra)) return false;
        if (filtros.costado     !== undefined && f.costado     !== filtros.costado)     return false;
        return true;
    };

    const filas = EXTRAS.filter(casa);
    if (filas.length === 0) return { encontrado: false };
    if (filas.length > 1) console.warn('buscarExtra: múltiples filas para', filtros, '→ se usa la primera');
    const f = filas[0];
    return {
        encontrado:   true,
        consultar:    f.consultar,
        codigo:       f.codigo,
        denominacion: f.denominacion,
        tarifa:       f.tarifa,
        dto:          f.dto
    };
}

// ── Helpers de alto nivel por familia ───────────────────────────
// Encapsulan la lógica SQL de cada línea. La Fase 3 los invoca directamente.

// (3) Bisagra. Estándar: TipoBisagra + TipoMontaje + Color.
//     KABI/HAVA: TipoBisagra + Acabado (Color vacío en CSV).
function buscarBisagra(tipoBisagra, { montaje, color, acabado } = {}) {
    const esFijaAcabado = tipoBisagra === 'KABI' || tipoBisagra === 'HAVA';
    if (esFijaAcabado) {
        return buscarExtra({ familia: 'Bisagra', tipoBisagra, acabado });
    }
    return buscarExtra({ familia: 'Bisagra', tipoBisagra, tipoMontaje: montaje, color });
}

// (4) Base. Dependiente de TipoBisagra (ALU20/D35 o D35-S) + Color + Costado.
//     KABI/HAVA no llevan base → devuelve null (sin línea).
function buscarBase(tipoBisagra, { color, costado } = {}) {
    if (tipoBisagra === 'KABI' || tipoBisagra === 'HAVA') return null;
    return buscarExtra({ familia: 'Base', tipoBisagra, color, costado });
}

// (5) Mecanizado por código exacto (VV.MEC.B bisagra extra, VV.MEC.T tirador).
function buscarMecanizado(codigo) {
    return buscarExtra({ familia: 'Mecanizado', codigoExacto: codigo });
}

// (6) Tirador. Prefijo modelo (79971/7997/7794) + Acabado.
//     Precio de línea = tarifa tirador + mecanizado tirador (VV.MEC.T).
//     El código del mecanizado NO se muestra; solo suma al importe.
function buscarTirador(tiradorTipo, acabadoCodigo) {
    const tir = buscarExtra({ familia: 'Tirador', codigoPrefijo: tiradorTipo, acabado: acabadoCodigo });
    if (!tir.encontrado) return tir;
    if (tir.consultar) return tir;   // repintable/ESP → sin precio, no se suma mecanizado
    const mec = buscarMecanizado('VV.MEC.T');
    const precioMec = (mec.encontrado && !mec.consultar) ? mec.tarifa : 0;
    return { ...tir, tarifa: tir.tarifa + precioMec };
}

// ── Composición de código y denominación Odoo ───────────────────
// Código: VV.{codeTipo}{00|01}.{familiaAcabado}   ej: VV.0101.L
// Agrupa a propósito: el acabado concreto, el color de vidrio y las medidas
// las aportan la denominación y las observaciones (90 códigos en total).
function componerCodigo() {
    const m     = CONFIG.modelos[state.modelo];
    const a     = CONFIG.acabados[state.acabado];
    const letra = CONFIG.codeAcabPorGrupo[a.grupoPrecio] || 'E';
    return `VV.${m.codeTipo}${state.vidrioMontado ? '01' : '00'}.${letra}`;
}

function componerDenominacion() {
    const m  = CONFIG.modelos[state.modelo];
    const a  = CONFIG.acabados[state.acabado];
    const cv = state.vidrioMontado ? CONFIG.coloresVidrio[state.colorVidrio] : null;
    return `${m.denominacion} ${a.denominacion}` + (cv ? ` + ${cv.denominacion}` : '');
}

function componerObservaciones() {
    // Lado del mecanizado de bisagra = mano (dónde van las bisagras).
    const lado = fabState.mano === 'izquierda' ? 'Izquierdo'
               : fabState.mano === 'derecha'   ? 'Derecho'
               : '';
    const ladoTxt = lado ? ` - lado ${lado}` : '';

    const bisagrasTxt = state.sinMecanizado
        ? `${state.bisagrasTotal} Mecanizados de Bisagra (sin mecanizar)${ladoTxt}`
        : `${state.bisagrasTotal} Mecanizados de Bisagra${ladoTxt}`;

    const partes = [
        `Medidas: ${state.alturaReal} x ${state.anchoReal} mm`
    ];

    // El vidrio solo se pide (y por tanto se acota) si es montado.
    if (state.vidrioMontado === true) {
        partes.push(`Vidrio: ${state.vidrioAlto} x ${state.vidrioAncho} mm`);
    }

    partes.push(bisagrasTxt);

    // Texto libre de especiales (si aplica), al final para no romper el resto.
    if (state.acabado === 'ESP' && state.acabadoEspecial) {
        partes.push(`Acabado especial: ${state.acabadoEspecial}`);
    }
    if (state.colorVidrio === 'especial' && state.vidrioEspecial) {
        partes.push(`Vidrio especial: ${state.vidrioEspecial}`);
    }

    return partes.join(' - ');
}

// ── Cálculo completo del presupuesto ────────────────────────────
function calcularPresupuestoCompleto() {
    const m = CONFIG.modelos[state.modelo];
    const grupoAcabado = CONFIG.acabados[state.acabado].grupoPrecio;
    const grupoVidrio  = state.vidrioMontado
        ? CONFIG.coloresVidrio[state.colorVidrio].grupoPrecio
        : 'SINVIDRIO';

    const r = {
        grupoAcabado,
        grupoVidrio,
        cantidad:  state.cantidad,   // nº de vitrinas
        lineas:    [],               // cada línea: { tipo, codigo, denom, cantidad, precioUnit, importe, dto, consultar }
        consultar: false,            // true si alguna línea de la vitrina obliga a consultar
        total:     0
    };

    const nVitrinas = state.cantidad;

    // Helper para añadir línea. importe = precioUnit × cantidad (o null si consultar).
    const addLinea = (o) => {
        const consultar = !!o.consultar;
        const precioUnit = consultar ? null : (o.precioUnit || 0);
        const importe = consultar ? null : precioUnit * o.cantidad;
        if (consultar) r.consultar = true;
        r.lineas.push({
            tipo:       o.tipo,
            codigo:     o.codigo || '',
            denom:      o.denom || '',
            cantidad:   o.cantidad,
            precioUnit,
            importe,
            dto:        o.dto || 0,
            consultar
        });
        if (importe) r.total += importe;
    };

    // ── (1) VITRINA (core) ──────────────────────────────────
    if (grupoAcabado === 'CONSULTAR') {
        addLinea({ tipo: 'vitrina', codigo: componerCodigo(), denom: componerDenominacion(),
                   cantidad: nVitrinas, consultar: true });
    } else if (grupoVidrio === 'CONSULTAR') {
        addLinea({ tipo: 'vitrina', codigo: componerCodigo(), denom: componerDenominacion(),
                   cantidad: nVitrinas, consultar: true });
    } else {
        const t = buscarTarifa(state.modelo, grupoAcabado, grupoVidrio, state.anchoReal, state.alturaReal);
        addLinea({ tipo: 'vitrina', codigo: componerCodigo(), denom: componerDenominacion(),
                   cantidad: nVitrinas, precioUnit: t.consultar ? 0 : t.tarifa, consultar: t.consultar });
    }

    // ── (2) OBSERVACIONES (informativa, sin precio ni cantidad) ──
    r.observaciones = componerObservaciones();

    // ── (3)(4)(5) MECANIZADO EXTRA / BISAGRAS / BASE ────────
    // Orden en el grid: mecanizado extra → bisagra → base.
    // ── (3) MECANIZADO BISAGRA EXTRA (VV.MEC.B) ─────────────
    // Independiente de comprar bisagras: puede haber mecanizado extra
    // sin adjuntar bisagras. Se muestra siempre que haya extras.
    if (state.bisagrasExtras > 0) {
        const mec = buscarMecanizado('VV.MEC.B');
        const cantMec = state.bisagrasExtras * nVitrinas;
        if (!mec.encontrado) {
            addLinea({ tipo: 'mecanizado', codigo: 'VV.MEC.B',
                       denom: 'Mecanizado bisagra extra', cantidad: cantMec, consultar: true });
        } else {
            addLinea({ tipo: 'mecanizado', codigo: mec.codigo, denom: mec.denominacion,
                       cantidad: cantMec, precioUnit: mec.tarifa, consultar: mec.consultar });
        }
    }

    // ── (4)(5) BISAGRA / BASE ───────────────────────────────
    // Solo si se adjuntan bisagras como artículo.
    if (state.adjuntarBisagras === true) {
        const tipoBis = m.tipobisagra;
        const esFija  = tipoBis === 'KABI' || tipoBis === 'HAVA';

        // (4) Bisagra
        const bis = esFija
            ? buscarBisagra(tipoBis, { acabado: state.acabado })
            : buscarBisagra(tipoBis, { montaje: fabState.bisMontaje, color: fabState.bisColor });

        const cantBisagras = state.bisagrasTotal * nVitrinas;
        if (!bis.encontrado) {
            addLinea({ tipo: 'bisagra', denom: 'Bisagra ' + tipoBis + ' (sin tarifa)',
                       cantidad: cantBisagras, consultar: true });
        } else {
            addLinea({ tipo: 'bisagra', codigo: bis.codigo, denom: bis.denominacion,
                       cantidad: cantBisagras, precioUnit: bis.tarifa,
                       dto: bis.dto, consultar: bis.consultar });
        }

        // (5) Base (KABI/HAVA → null, sin línea)
        const base = buscarBase(tipoBis, { color: fabState.bisColor, costado: fabState.bisBase });
        if (base) {
            if (!base.encontrado) {
                addLinea({ tipo: 'base', denom: 'Base bisagra (sin tarifa)',
                           cantidad: cantBisagras, consultar: true });
            } else {
                addLinea({ tipo: 'base', codigo: base.codigo, denom: base.denominacion,
                           cantidad: cantBisagras, precioUnit: base.tarifa,
                           dto: base.dto, consultar: base.consultar });
            }
        }
    }

    // ── (6) TIRADOR (1 por vitrina; precio ya incluye VV.MEC.T) ──
    if (state.tirador && state.tiradorTipo) {
        const acabadoCodigo = CONFIG.acabados[state.acabado].codigo;
        const tir = buscarTirador(state.tiradorTipo, acabadoCodigo);
        if (!tir.encontrado) {
            addLinea({ tipo: 'tirador',
                       denom: 'Tirador ' + CONFIG.tiradores[state.tiradorTipo].medidas + ' (sin tarifa)',
                       cantidad: nVitrinas, consultar: true });
        } else {
            addLinea({ tipo: 'tirador', codigo: tir.codigo, denom: tir.denominacion,
                       cantidad: nVitrinas, precioUnit: tir.tarifa, consultar: tir.consultar });
        }
    }

    return r;
}

// ── Utilidades de la vista ──────────────────────────────────────
function fmtEur(n) {
    return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

// Copia de respaldo si el navegador no expone navigator.clipboard
function fallbackCopia(texto, onOk) {
    const ta = document.createElement('textarea');
    ta.value = texto;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); if (onOk) onOk(); } catch (_) {}
    document.body.removeChild(ta);
}

// ── Vista de presupuesto (informe hoja A4, lenguaje ecosistema) ─
async function mostrarPresupuesto() {
    // Ambas cargas son obligatorias: init() intenta cargarExtras() pero traga el
    // error, así que sin este await EXTRAS puede seguir a null y buscarExtra
    // reventaría al calcular bisagras, base o tirador.
    try {
        await cargarTarifas();
        await cargarExtras();
    } catch (e) {
        aviso(`Error al cargar la tarifa de precios:\n${e.message}`);
        return;
    }

    const r = calcularPresupuestoCompleto();
    pintarInforme(r);

    mostrarVista('presu');
}

// Atrás desde presupuesto → vuelve a fabricación en el mismo estado.
// mostrarVista solo muestra/oculta: no re-renderiza ni resetea fabState,
// por lo que las selecciones de fabricación permanecen intactas.
function volverDePresupuesto() {
    mostrarVista('fab');
}

// Último resultado calculado (para reutilizar en el PDF nativo sin recalcular)
let PRESU_ULTIMO = null;

function pintarInforme(r) {
    PRESU_ULTIMO = r;
    const m  = CONFIG.modelos[state.modelo];
    const a  = CONFIG.acabados[state.acabado];

    // Fecha y versión
    document.getElementById('presuFecha').textContent = new Date().toLocaleDateString('es-ES');
    const trazaVista = (typeof lineaTrazabilidad === 'function') ? lineaTrazabilidad() : '';
    document.getElementById('presuVersion').textContent =
        (trazaVista ? trazaVista + ' · ' : '') +
        (window.VERSION_APP ? 'Adinor · Vitrinas · ' + window.VERSION_APP : 'Adinor · Vitrinas');

    // Imagen del perfil (misma fuente que la vista previa del Form1)
    const nombreImagen = m.imagen || state.modelo;
    const imagenUrl = `https://raw.githubusercontent.com/Jdurba/Vitrinas/main/Imagenes/${nombreImagen}_cotas.jpg`;
    document.getElementById('presuImagen').innerHTML =
        `<img src="${imagenUrl}" alt="Perfil ${state.modelo}"
              onerror="this.parentElement.innerHTML='<div class=\\'preview-placeholder\\'>Imagen no disponible</div>'">`;

    // Parámetros — línea a línea (una sola columna, junto a la imagen)
    const dato = (l, v) =>
        `<div class="campo-informe"><label>${l}</label><span class="valor">${v}</span></div>`;

    document.getElementById('presuDatos').innerHTML =
        dato('Nº Pedido', state.numPedido || '—') +
        dato('Cliente / Ref.', state.cliente || '—') +
        dato('Modelo', state.modelo + ' — ' + m.nombre) +
        dato('Acabado', a.nombre) +
        (state.acabado === 'ESP' && state.acabadoEspecial ? dato('Acabado especial', state.acabadoEspecial) : '') +
        dato('Medidas vitrina', state.alturaReal + ' × ' + state.anchoReal + ' mm') +
        dato('Medida vidrio', state.vidrioAlto + ' × ' + state.vidrioAncho + ' mm') +
        dato('Vidrio montado', state.vidrioMontado ? 'Sí — ' + CONFIG.coloresVidrio[state.colorVidrio].nombre : 'No') +
        (state.colorVidrio === 'especial' && state.vidrioEspecial ? dato('Vidrio especial', state.vidrioEspecial) : '') +
        dato('Bisagras', state.bisagrasTotal + (state.sinMecanizado ? ' (sin mecanizar)' : (state.bisagrasExtras > 0 ? ' (' + state.bisagrasExtras + ' extra)' : ''))) +
        dato('Tirador', state.tirador && state.tiradorTipo ? CONFIG.tiradores[state.tiradorTipo].medidas : 'No') +
        dato('Cantidad', state.cantidad + ' ud.');

    // Artículos: recorre r.lineas[]. Las celdas copiables llevan data-copia
    // con el texto crudo (sin badges ni markup) y se copian con un clic.
    const esc = (v) => String(v).replace(/"/g, '&quot;');
    // La nota es texto libre del usuario: necesita escapado real, no solo comillas.
    const escHtml = (v) => String(v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const celUnit = (l) => l.consultar
        ? '<span class="incluido">consultar</span>'
        : (l.precioUnit != null ? fmtEur(l.precioUnit) : '');
    const celPrecio = (l) => l.consultar
        ? '<span class="incluido">consultar</span>'
        : fmtEur(l.importe);

    let filas = '';
    for (const l of r.lineas) {
        const dtoTxt = l.dto ? ` <span class="dto-badge">Dto ${l.dto}%</span>` : '';
        // La denominación solo es copiable en la vitrina: la de los complementos
        // viene del CSV y ya existe en Odoo con su propia descripción.
        const denomAttr = l.tipo === 'vitrina' ? ` data-copia="${esc(l.denom)}"` : '';
        filas += `<tr>
            <td class="cod" data-copia="${esc(l.codigo)}">${l.codigo}</td>
            <td${denomAttr}>${l.denom}${dtoTxt}</td>
            <td class="num">${l.cantidad}</td>
            <td class="num">${celUnit(l)}</td>
            <td class="num">${celPrecio(l)}</td>
        </tr>`;

        // Observaciones: van justo tras la línea de vitrina, ligadas a ella.
        if (l.tipo === 'vitrina' && r.observaciones) {
            filas += `<tr class="obs">
                <td></td>
                <td colspan="4" data-copia="${esc(r.observaciones)}">${r.observaciones}</td>
            </tr>`;
        }
    }

    document.getElementById('presuArticulos').innerHTML = filas;

    // ── Observaciones de cabecera ───────────────────────────────
    // Bloque propio entre parámetros y aviso de vidrio templado: acompaña al
    // documento, no define la vitrina, así que no entra en el grid de artículos.
    const notaEl = document.getElementById('presuNota');
    if (notaEl) {
        const nota = (state.nota || '').trim();
        if (nota) {
            const notaSeg = escHtml(nota).replace(/"/g, '&quot;');
            notaEl.innerHTML =
                `<span class="nota-label">Observaciones</span>` +
                `<span data-copia="${notaSeg}">${escHtml(nota)}</span>`;
            notaEl.style.display = '';
        } else {
            notaEl.innerHTML = '';
            notaEl.style.display = 'none';
        }
    }

    // Total o CONSULTAR
    const motivoEl = document.getElementById('presuMotivo');
    if (r.consultar) {
        document.getElementById('presuTotal').textContent = 'CONSULTAR';
        motivoEl.textContent = 'Alguna línea requiere consulta de precio.';
        motivoEl.style.display = 'block';
    } else {
        document.getElementById('presuTotal').textContent = fmtEur(r.total);
        motivoEl.style.display = 'none';
    }

    // Delegación de copia: tabla de artículos y bloque de observaciones.
    bindCopiaPorClic(document.getElementById('presuArticulos'));
    bindCopiaPorClic(notaEl);
}

// Un clic en cualquier elemento con data-copia → portapapeles, con flash verde.
// Si el usuario ha seleccionado texto a mano, el clic no copia.
function bindCopiaPorClic(contenedor) {
    if (!contenedor) return;
    contenedor.onclick = (e) => {
        const el = e.target.closest('[data-copia]');
        if (!el || !contenedor.contains(el)) return;
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) return;
        const texto = el.dataset.copia;
        const ok = () => {
            el.classList.add('copiada');
            setTimeout(() => el.classList.remove('copiada'), 900);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(texto).then(ok).catch(() => fallbackCopia(texto, ok));
        } else {
            fallbackCopia(texto, ok);
        }
    };
}

// ── PDF NATIVO: redibujado con jsPDF + autotable ────────────────
// Texto seleccionable, nitidez vectorial, peso mínimo. Sin html2canvas.
async function generarPDFPresupuesto() {
    const btn = document.getElementById('presuBtnPDF');
    const textoOrig = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Generando…';

    try {
        const { jsPDF } = window.jspdf;
        const r = PRESU_ULTIMO || calcularPresupuestoCompleto();
        const m = CONFIG.modelos[state.modelo];
        const a = CONFIG.acabados[state.acabado];

        const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
        // autoTable v5 en navegador: método pdf.autoTable(opts). Fallback a función global.
        const runAutoTable = (opts) => {
            if (typeof pdf.autoTable === 'function') return pdf.autoTable(opts);
            const fn = window.autoTable || window.jspdf?.autoTable;
            if (typeof fn === 'function') return fn(pdf, opts);
            throw new Error('autoTable no disponible');
        };

        const W = 210, mL = 14, mR = 14, contentW = W - mL - mR;
        const AZUL = [45, 58, 75];
        const GRIS = [90, 90, 90];
        let y = 12;

        // ── CABECERA: logo + título ──
        const logoUrl = 'https://jdurba.github.io/General/img/LOGO_2025_Negro.png';
        const logoData = await cargarImagenComoData(logoUrl, 34, 13, 'PNG');
        if (logoData) {
            const f = fitImageInBox(logoData.naturalWidth, logoData.naturalHeight, 34, 13);
            pdf.addImage(logoData.dataUrl, 'PNG', mL + f.offsetX, y + f.offsetY, f.w, f.h);
        }
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(15); pdf.setTextColor(...AZUL);
        pdf.text('PRESUPUESTO', W - mR, y + 6, { align: 'right' });
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(...GRIS);
        pdf.text(new Date().toLocaleDateString('es-ES'), W - mR, y + 11, { align: 'right' });
        y += 20;

        pdf.setDrawColor(...AZUL); pdf.setLineWidth(0.4);
        pdf.line(mL, y, W - mR, y);
        y += 6;

        // ── TÍTULO: PARÁMETROS SELECCIONADOS (banda gris, como ARTÍCULOS) ──
        pdf.setFillColor(230, 230, 230);
        pdf.rect(mL, y, contentW, 7, 'F');
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(...AZUL);
        pdf.text('PARÁMETROS SELECCIONADOS', mL + 3, y + 4.8);
        y += 10;

        // ── BLOQUE DATOS: imagen perfil (izq) + parámetros (der) ──
        const imgBoxW = 46, imgBoxH = 46;
        const perfilUrl = `https://raw.githubusercontent.com/Jdurba/Vitrinas/main/Imagenes/${m.imagen || state.modelo}_cotas.jpg`;
        const perfilImg = await cargarImagenComoData(perfilUrl, imgBoxW, imgBoxH, 'JPEG');
        const yDatos = y;
        if (perfilImg) {
            const f = fitImageInBox(perfilImg.naturalWidth, perfilImg.naturalHeight, imgBoxW, imgBoxH);
            pdf.addImage(perfilImg.dataUrl, 'JPEG', mL + f.offsetX, yDatos + f.offsetY, f.w, f.h);
        }

        // Parámetros a la derecha de la imagen
        const datos = [];
        datos.push(['Nº Pedido', state.numPedido || '—']);
        datos.push(['Cliente / Ref.', state.cliente || '—']);
        datos.push(['Modelo', state.modelo + ' — ' + m.nombre]);
        datos.push(['Acabado', a.nombre]);
        if (state.acabado === 'ESP' && state.acabadoEspecial) datos.push(['Acabado especial', state.acabadoEspecial]);
        datos.push(['Medidas vitrina', state.alturaReal + ' × ' + state.anchoReal + ' mm']);
        datos.push(['Medida vidrio', state.vidrioAlto + ' × ' + state.vidrioAncho + ' mm']);
        datos.push(['Vidrio montado', state.vidrioMontado ? 'Sí — ' + CONFIG.coloresVidrio[state.colorVidrio].nombre : 'No']);
        if (state.colorVidrio === 'especial' && state.vidrioEspecial) datos.push(['Vidrio especial', state.vidrioEspecial]);
        datos.push(['Bisagras', String(state.bisagrasTotal) + (state.sinMecanizado ? ' (sin mecanizar)' : (state.bisagrasExtras > 0 ? ' (' + state.bisagrasExtras + ' extra)' : ''))]);
        datos.push(['Tirador', state.tirador && state.tiradorTipo ? CONFIG.tiradores[state.tiradorTipo].medidas : 'No']);
        datos.push(['Cantidad', state.cantidad + ' ud.']);

        const datosX = mL + imgBoxW + 8;
        const labelW = 34;
        let yd = yDatos + 2;
        pdf.setFontSize(8.5);
        for (const [label, valor] of datos) {
            pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...GRIS);
            pdf.text(label, datosX, yd);
            pdf.setFont('helvetica', 'normal'); pdf.setTextColor(30, 30, 30);
            pdf.text(String(valor), datosX + labelW, yd);
            yd += 5;
        }

        y = Math.max(yDatos + imgBoxH, yd) + 6;

        // ── OBSERVACIONES de cabecera ──
        // Bloque propio entre parámetros y aviso, igual que en la vista:
        // no forma parte de la tabla de artículos. Alto dinámico según el texto.
        const notaPDF = (state.nota || '').trim();
        if (notaPDF) {
            pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
            const lineasNota = pdf.splitTextToSize(notaPDF, contentW - 8);
            const altoNota = 8 + lineasNota.length * 3.6;

            pdf.setFillColor(247, 249, 252);
            pdf.setDrawColor(203, 213, 225); pdf.setLineWidth(0.2);
            pdf.rect(mL, y, contentW, altoNota, 'FD');
            pdf.setFillColor(...AZUL);
            pdf.rect(mL, y, 0.9, altoNota, 'F');   // filete izquierdo, como en la vista

            pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5); pdf.setTextColor(...AZUL);
            pdf.text('OBSERVACIONES', mL + 4, y + 4);

            pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(60, 60, 60);
            let yNota = y + 8;
            for (const ln of lineasNota) { pdf.text(ln, mL + 4, yNota); yNota += 3.6; }

            y += altoNota + 5;
        }

        // ── AVISO vidrio templado (siempre) ──
        pdf.setFillColor(255, 249, 219);
        pdf.setDrawColor(230, 200, 100); pdf.setLineWidth(0.2);
        pdf.rect(mL, y, contentW, 7, 'FD');
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5); pdf.setTextColor(120, 90, 20);
        pdf.text('IMPORTANTE: Todos los cálculos están realizados para emplear vidrio templado de 4 mm',
                 mL + 3, y + 4.6);
        y += 11;

        // ── TÍTULO DE SECCIÓN: ARTÍCULOS (banda gris, como la vista) ──
        pdf.setFillColor(230, 230, 230);
        pdf.rect(mL, y, contentW, 7, 'F');
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(...AZUL);
        pdf.text('ARTÍCULOS', mL + 3, y + 4.8);
        y += 10;

        // ── TABLA DE ARTÍCULOS (autotable, texto seleccionable) ──
        const fmtCel = (l, campo) => {
            if (l.consultar) return 'consultar';
            if (campo === 'unit') return l.precioUnit != null ? fmtEur(l.precioUnit) : '';
            return fmtEur(l.importe);
        };

        const body = [];
        for (const l of r.lineas) {
            const denom = l.denom + (l.dto ? `  (Dto ${l.dto}%)` : '');
            body.push([l.codigo || '', denom, String(l.cantidad ?? ''), fmtCel(l, 'unit'), fmtCel(l, 'sub')]);
            // Observaciones ligadas a la vitrina, fila que ocupa toda la fila de descripción
            if (l.tipo === 'vitrina' && r.observaciones) {
                body.push([{ content: r.observaciones, colSpan: 5, styles: { fontStyle: 'italic', textColor: [110, 110, 110], fontSize: 7.5 } }]);
            }
        }

        runAutoTable({
            startY: y,
            head: [['Código', 'Descripción', 'Cant.', 'P. Unit.', 'Subtotal']],
            body,
            theme: 'grid',
            margin: { left: mL, right: mR },
            styles: { fontSize: 8, cellPadding: 1.6, lineColor: [50, 50, 50], lineWidth: 0.1, textColor: [30, 30, 30] },
            headStyles: { fillColor: [221, 221, 221], textColor: [40, 40, 40], fontStyle: 'bold', halign: 'left' },
            columnStyles: {
                0: { cellWidth: 28, fontStyle: 'bold' },
                1: { cellWidth: 'auto' },
                2: { cellWidth: 14, halign: 'right' },
                3: { cellWidth: 24, halign: 'right' },
                4: { cellWidth: 24, halign: 'right' }
            }
        });

        y = pdf.lastAutoTable.finalY + 4;

        // ── TOTAL ──
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.setTextColor(...AZUL);
        const totalTxt = r.consultar ? 'CONSULTAR' : fmtEur(r.total);
        pdf.text('TOTAL:', W - mR - 40, y + 2, { align: 'right' });
        pdf.text(totalTxt, W - mR, y + 2, { align: 'right' });
        y += 8;
        if (r.consultar) {
            pdf.setFont('helvetica', 'italic'); pdf.setFontSize(8); pdf.setTextColor(...GRIS);
            pdf.text('Alguna línea requiere consulta de precio.', W - mR, y, { align: 'right' });
            y += 5;
        }

        // ── PIE / versión ──
        const H = 297;
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5); pdf.setTextColor(200, 200, 200);
        pdf.text(window.VERSION_APP ? 'Adinor · Vitrinas · ' + window.VERSION_APP : 'Adinor · Vitrinas', W - mR, H - 6, { align: 'right' });

        // Trazabilidad: solo si la configuración procede de un fichero importado.
        const trazaPresu = (typeof lineaTrazabilidad === 'function') ? lineaTrazabilidad() : '';
        if (trazaPresu) {
            pdf.setTextColor(160, 160, 160);
            pdf.text(trazaPresu, mL, H - 6);
        }

        const fechaArch = new Date().toLocaleDateString('es-ES').replace(/\//g, '-');
        const nombrePDF = state.numPedido
            ? `Presupuesto-${state.numPedido}${state.cliente ? '-' + state.cliente : ''}-${fechaArch}.pdf`
            : `Vitrina_${state.modelo}_${state.anchoReal}x${state.alturaReal}.pdf`;
        pdf.save(nombrePDF);
    } catch (e) {
        aviso('No se pudo generar el PDF.\n' + e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = textoOrig;
    }
}

// ── Inicialización de la vista ──────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('presuBtnVolver')?.addEventListener('click', volverDePresupuesto);
    document.getElementById('presuBtnPDF')?.addEventListener('click', generarPDFPresupuesto);

    // Botón "Presupuesto" del header de fabricación.
    // El estado disabled lo gestiona fabricacion.js (actualizarEstadoPDF)
    // según la captura de bisagras.
    document.getElementById('fabBtnPresupuesto')
        ?.addEventListener('click', mostrarPresupuesto);
});
