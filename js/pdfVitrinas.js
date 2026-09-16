// ============================================
// PDF VITRINAS — Generador nativo jsPDF
// ============================================

// ── DISPARADOR PDF ──────────────────────────
// Cliente y Nº Pedido se recogen en el formulario (state), no en modal.
function lanzarPDFVitrinas() {
    generarPDFVitrinas(state.numPedido || '', state.cliente || '');
}

// ============================================================
// DIBUJO TÉCNICO NATIVO (jsPDF) — reemplaza svg2pdf
// Replica generarSVGTrasera/Frontal de fabricacion.js con
// primitivas jsPDF. Vector real, peso mínimo. Reutiliza las
// mismas fórmulas de coordenadas (calcularCn, getBisagraPxPositions,
// getTiradorLado) para no duplicar lógica.
//
// Sistema de coordenadas interno del dibujo: viewBox 0..VW × 0..VH
// (400×560), igual que el SVG. Un helper 'M' mapea esas coordenadas
// al rectángulo destino del PDF (x0,y0,w,h en mm).
// ============================================================

// Colores del dibujo (mismos del SVG, en RGB para jsPDF)
const D_FRAME = [45, 58, 75];    // #2D3A4B
const D_DIM   = [26, 26, 26];    // #1a1a1a
const D_TIR   = [26, 26, 46];    // #1a1a2e
const D_GLASS = [214, 234, 248]; // #d6eaf8  cristal plano azulado
const D_FRAMEFILL = [176, 190, 197]; // #b0bec5 perfil

// Crea un mapeador de coordenadas dibujo(px)→PDF(mm) para un rect destino.
function crearMapa(x0, y0, w, h, VW, VH) {
    const sx = w / VW, sy = h / VH;
    return {
        x: (px) => x0 + px * sx,
        y: (py) => y0 + py * sy,
        s: (v)  => v * sx,   // escala genérica (usa X; el dibujo mantiene proporción)
        sx, sy
    };
}

// Marco de la puerta: perfil + ingletes + cristal (relleno plano azulado)
function pdfDoorFrame(pdf, M, dX, dY, dW, dH, fr, conVidrio) {
    // Perfil exterior (relleno gris, borde azul)
    pdf.setFillColor(...D_FRAMEFILL);
    pdf.setDrawColor(...D_FRAME);
    pdf.setLineWidth(0.5);
    pdf.rect(M.x(dX), M.y(dY), M.s(dW), M.s(dH), 'FD');

    // Ingletes (líneas diagonales de esquina)
    pdf.setLineWidth(0.35);
    const line = (x1, y1, x2, y2) => pdf.line(M.x(x1), M.y(y1), M.x(x2), M.y(y2));
    line(dX,      dY,      dX + fr,      dY + fr);
    line(dX + dW, dY,      dX + dW - fr, dY + fr);
    line(dX,      dY + dH, dX + fr,      dY + dH - fr);
    line(dX + dW, dY + dH, dX + dW - fr, dY + dH - fr);

    // Cristal interior (plano azulado si hay vidrio, blanco si no)
    if (conVidrio) pdf.setFillColor(...D_GLASS);
    else           pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(170, 170, 170);
    pdf.setLineWidth(0.2);
    pdf.rect(M.x(dX + fr), M.y(dY + fr), M.s(dW - 2*fr), M.s(dH - 2*fr), 'FD');
}

// Bisagra escuadra en L (HAVA/HAVASP) — polígono cerrado relleno blanco
function pdfBisagraEsquina(pdf, M, dX, dY, dW, dH, fr, bisLado) {
    const eW  = fr * (20 / 70);
    const eL  = fr * 1;
    const off = fr * 0.20;

    function lPoly(corner) {
        let pts;
        if (corner === 'tl') pts = [
            [dX+off+eL, dY+off], [dX+off, dY+off], [dX+off, dY+off+eL],
            [dX+off+eW, dY+off+eL], [dX+off+eW, dY+off+eW], [dX+off+eL, dY+off+eW]
        ];
        else if (corner === 'tr') pts = [
            [dX+dW-off-eL, dY+off], [dX+dW-off, dY+off], [dX+dW-off, dY+off+eL],
            [dX+dW-off-eW, dY+off+eL], [dX+dW-off-eW, dY+off+eW], [dX+dW-off-eL, dY+off+eW]
        ];
        else if (corner === 'bl') pts = [
            [dX+off+eL, dY+dH-off], [dX+off, dY+dH-off], [dX+off, dY+dH-off-eL],
            [dX+off+eW, dY+dH-off-eL], [dX+off+eW, dY+dH-off-eW], [dX+off+eL, dY+dH-off-eW]
        ];
        else pts = [
            [dX+dW-off-eL, dY+dH-off], [dX+dW-off, dY+dH-off], [dX+dW-off, dY+dH-off-eL],
            [dX+dW-off-eW, dY+dH-off-eL], [dX+dW-off-eW, dY+dH-off-eW], [dX+dW-off-eL, dY+dH-off-eW]
        ];
        // Dibujar polígono cerrado con pdf.lines (deltas desde el primer punto)
        const start = pts[0];
        const deltas = [];
        for (let i = 1; i < pts.length; i++) {
            deltas.push([M.x(pts[i][0]) - M.x(pts[i-1][0]), M.y(pts[i][1]) - M.y(pts[i-1][1])]);
        }
        pdf.setFillColor(255, 255, 255);
        pdf.setDrawColor(17, 17, 17);
        pdf.setLineWidth(0.4);
        pdf.lines(deltas, M.x(start[0]), M.y(start[1]), [1, 1], 'FD', true);
    }

    if (bisLado === 'izquierda') { lPoly('tl'); lPoly('bl'); }
    else                         { lPoly('tr'); lPoly('br'); }
}

// Flecha triangular (para cotas). dir: 'up','down','left','right'
function pdfFlecha(pdf, M, x, y, dir, arw) {
    const a = M.s(arw);
    const px = M.x(x), py = M.y(y);
    let x2, y2, x3, y3;
    if (dir === 'up')    { x2 = px - a/2; y2 = py + a*1.4; x3 = px + a/2; y3 = py + a*1.4; }
    else if (dir === 'down') { x2 = px - a/2; y2 = py - a*1.4; x3 = px + a/2; y3 = py - a*1.4; }
    else if (dir === 'left') { x2 = px + a*1.4; y2 = py - a/2; x3 = px + a*1.4; y3 = py + a/2; }
    else /* right */         { x2 = px - a*1.4; y2 = py - a/2; x3 = px - a*1.4; y3 = py + a/2; }
    pdf.setFillColor(...D_DIM);
    pdf.triangle(px, py, x2, y2, x3, y3, 'F');
}

// Cota vertical con flechas y texto (equiv. svgDimV)
function pdfDimV(pdf, M, x, y1, y2, name, value, side, showValue) {
    const arw = 7, gap = 8;
    const top = Math.min(y1, y2), bot = Math.max(y1, y2);
    const midY = (top + bot) / 2, pxH = bot - top;
    const tx = side === 'left' ? x - gap : x + gap;
    const align = side === 'left' ? 'right' : 'left';

    pdf.setDrawColor(...D_DIM); pdf.setLineWidth(0.3);
    pdf.line(M.x(x), M.y(top), M.x(x), M.y(bot));
    pdfFlecha(pdf, M, x, top, 'up', arw);
    pdfFlecha(pdf, M, x, bot, 'down', arw);

    if (pxH >= 14) {
        pdf.setTextColor(...D_DIM);
        pdf.setFontSize(7);
        if (showValue) {
            if (name) {
                pdf.setFont('helvetica', 'bold');
                pdf.text(String(name), M.x(tx), M.y(midY - 6), { align, baseline: 'middle' });
                pdf.setFont('helvetica', 'normal');
                pdf.text(String(value), M.x(tx), M.y(midY + 7), { align, baseline: 'middle' });
            } else {
                pdf.setFont('helvetica', 'bold');
                pdf.text(String(value), M.x(tx), M.y(midY), { align, baseline: 'middle' });
            }
        } else {
            pdf.setFont('helvetica', 'bold');
            pdf.text(String(name), M.x(tx), M.y(midY), { align, baseline: 'middle' });
        }
    }
}

// Cota horizontal con flechas y texto (equiv. svgDimH)
function pdfDimH(pdf, M, x1, x2, y, value, above) {
    const arw = 7;
    const midX = (x1 + x2) / 2;
    const ty = above ? y - 12 : y + 14;

    pdf.setDrawColor(...D_DIM); pdf.setLineWidth(0.3);
    pdf.line(M.x(x1), M.y(y), M.x(x2), M.y(y));
    pdfFlecha(pdf, M, x1, y, 'left', arw);
    pdfFlecha(pdf, M, x2, y, 'right', arw);

    pdf.setTextColor(...D_DIM);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.text(String(value), M.x(midX), M.y(ty), { align: 'center', baseline: 'middle' });
}

// ── VISTA TRASERA (nativa) ──
function pdfDibujarTrasera(pdf, x0, y0, w, h) {
    const { alturaReal, anchoReal, bisagrasTotal } = state;
    const { mano } = fabState;
    const VW = 400, VH = 560;
    const mL = 60, mR = 60, mTop = 65, mBot = 65;
    const availW = VW - mL - mR, availH = VH - mTop - mBot;
    const scale = Math.min(availW / anchoReal, availH / alturaReal);
    const dW = anchoReal * scale, dH = alturaReal * scale;
    const dX = mL + (availW - dW) / 2, dY = mTop + (availH - dH) / 2;
    const fr = 20, bisR = 8;

    const M = crearMapa(x0, y0, w, h, VW, VH);

    pdfDoorFrame(pdf, M, dX, dY, dW, dH, fr, state.vidrioMontado);

    if (mano && !state.sinMecanizado) {
        const bisLado = mano === 'izquierda' ? 'derecha' : 'izquierda';
        const esEsquina = CONFIG.modelos[state.modelo]?.tipobisagra === 'HAVA';

        if (esEsquina) {
            pdfBisagraEsquina(pdf, M, dX, dY, dW, dH, fr, bisLado);
        } else {
            const bisX  = bisLado === 'izquierda' ? dX + fr/2 : dX + dW - fr/2;
            const bisPx = getBisagraPxPositions(dY, dH);
            const dimX  = bisLado === 'izquierda' ? dX - 28 : dX + dW + 28;
            const dimSide = bisLado === 'izquierda' ? 'left' : 'right';

            pdf.setFillColor(255, 255, 255);
            pdf.setDrawColor(...D_FRAME);
            pdf.setLineWidth(0.35);
            bisPx.forEach(py => pdf.circle(M.x(bisX), M.y(py), M.s(bisR), 'FD'));

            pdfDimV(pdf, M, dimX, dY, bisPx[0], 'B1', 0, dimSide, false);
            for (let i = 0; i < bisPx.length - 1; i++) {
                pdfDimV(pdf, M, dimX, bisPx[i], bisPx[i+1], `C${i+1}`, 0, dimSide, false);
            }
            pdfDimV(pdf, M, dimX, bisPx[bisPx.length-1], dY + dH, 'B2', 0, dimSide, false);
        }
    }

    const yX    = mano === 'izquierda' ? dX - 30 : dX + dW + 30;
    const ySide = mano === 'izquierda' ? 'left' : 'right';
    pdfDimV(pdf, M, yX, dY, dY + dH, '', alturaReal, ySide, true);
    pdfDimH(pdf, M, dX, dX + dW, dY + dH + 27, anchoReal, false);
}

// ── VISTA FRONTAL (nativa) ──
function pdfDibujarFrontal(pdf, x0, y0, w, h) {
    const { alturaReal, anchoReal } = state;
    const VW = 400, VH = 560;
    const mL = 60, mR = 60, mTop = 65, mBot = 65;
    const availW = VW - mL - mR, availH = VH - mTop - mBot;
    const scale = Math.min(availW / anchoReal, availH / alturaReal);
    const dW = anchoReal * scale, dH = alturaReal * scale;
    const dX = mL + (availW - dW) / 2, dY = mTop + (availH - dH) / 2;
    const fr = 20;
    const lado = getTiradorLado();
    // Croquis NO a escala: perfil, bisagras y tirador van en píxeles fijos para
    // que se lean bien — ver nota en fabricacion.js → generarSVGFrontal.
    // tiradorLargoPx() vive en fabricacion.js (se carga antes que este fichero).
    const TL = tiradorLargoPx(lado, dW, dH), TG = 9;

    const M = crearMapa(x0, y0, w, h, VW, VH);

    pdfDoorFrame(pdf, M, dX, dY, dW, dH, fr, state.vidrioMontado);

    if (lado && fabState.tiradorZ) {
        let tx, ty, tw, th;
        if (lado === 'derecha') {
            const yc = dY + (alturaReal - fabState.tiradorZ) * scale;
            tx = dX + dW - TG/2; ty = yc - TL/2; tw = TG; th = TL;
            pdfDimV(pdf, M, dX + dW + TG/2 + 22, dY + dH, yc, '', fabState.tiradorZ, 'right', true);
        } else if (lado === 'izquierda') {
            const yc = dY + (alturaReal - fabState.tiradorZ) * scale;
            tx = dX - TG/2; ty = yc - TL/2; tw = TG; th = TL;
            pdfDimV(pdf, M, dX - TG/2 - 22, dY + dH, yc, '', fabState.tiradorZ, 'left', true);
        } else if (lado === 'arriba') {
            const xc = dX + fabState.tiradorZ * scale;
            tx = xc - TL/2; ty = dY - TG/2; tw = TL; th = TG;
            pdfDimH(pdf, M, dX, xc, dY - TG/2 - 22, fabState.tiradorZ, true);
        } else if (lado === 'abajo') {
            const xc = dX + fabState.tiradorZ * scale;
            tx = xc - TL/2; ty = dY + dH - TG/2; tw = TL; th = TG;
            pdfDimH(pdf, M, dX, xc, dY + dH + TG/2 + 22, fabState.tiradorZ, false);
        }
        pdf.setFillColor(...D_TIR);
        pdf.roundedRect(M.x(tx), M.y(ty), M.s(tw), M.s(th), M.s(2.5), M.s(2.5), 'F');
    }
}

// ── CARGAR IMAGEN EXTERNA COMO DATAURL ───────────────
// Devuelve { dataUrl, naturalWidth, naturalHeight } o null.
// Redimensiona el canvas al tamaño REAL de impresión (maxWmm × maxHmm a dpi dados)
// para no incrustar la resolución completa del origen. 'formato' controla la
// compresión: 'JPEG' (fotos, mucho más ligero) o 'PNG' (logos/transparencia).
function cargarImagenComoData(url, maxWmm = 40, maxHmm = 40, formato = 'JPEG', dpi = 150) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            // Píxeles máximos según tamaño físico en el PDF (mm → pulgadas → px)
            const pxPorMm = dpi / 25.4;
            const maxPxW = Math.round(maxWmm * pxPorMm);
            const maxPxH = Math.round(maxHmm * pxPorMm);
            // Escalar hacia abajo manteniendo proporción; nunca ampliar
            const ratio = Math.min(maxPxW / img.naturalWidth, maxPxH / img.naturalHeight, 1);
            const w = Math.max(1, Math.round(img.naturalWidth  * ratio));
            const h = Math.max(1, Math.round(img.naturalHeight * ratio));

            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            // Fondo blanco para JPEG (no soporta transparencia)
            if (formato === 'JPEG') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
            ctx.drawImage(img, 0, 0, w, h);
            try {
                const dataUrl = formato === 'JPEG'
                    ? canvas.toDataURL('image/jpeg', 0.82)
                    : canvas.toDataURL('image/png');
                resolve({ dataUrl, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
            } catch { resolve(null); }
        };
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

// ── AJUSTAR IMAGEN PROPORCIONALMENTE DENTRO DE UN RECUADRO ──
// Devuelve { w, h, x, y } para centrar la imagen dentro del box
function fitImageInBox(naturalW, naturalH, maxW, maxH) {
    const ratio = Math.min(maxW / naturalW, maxH / naturalH);
    const w = naturalW * ratio;
    const h = naturalH * ratio;
    // Centrar dentro del recuadro
    const x = (maxW - w) / 2;
    const y = (maxH - h) / 2;
    return { w, h, offsetX: x, offsetY: y };
}

// ── GENERADOR PRINCIPAL ──────────────────────────────
async function generarPDFVitrinas(pedido, cliente) {
    const btn = document.getElementById('fabBtnPDF');
    if (btn) { btn.textContent = '⏳ Generando...'; btn.style.pointerEvents = 'none'; }

    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const W = 210, H = 297;
        const mL = 14, mR = 14, mB = 12;
        const contentW = W - mL - mR;
        let y = 0; // cursor vertical

        // ── Datos ──
        const m     = CONFIG.modelos[state.modelo];
        const a     = CONFIG.acabados[state.acabado];
        const fecha = new Date().toLocaleDateString('es-ES');
        const tieneTirador  = state.tirador && state.tiradorTipo;
        const tieneVidrio   = state.vidrioMontado;
        const n             = state.bisagrasTotal;
        const bisagrasFijas = !!m?.bisagras_fijas;
        const sinMec        = state.sinMecanizado;

        // Medidas vidrio (calculadas en configurador.js → calcularVidrio)
        const vidrioAltura = state.vidrioAlto;
        const vidrioAncho  = state.vidrioAncho;

        // Mecanizado (acumulado)
        const cn    = calcularCn();
        const allCs = n > 1 ? [...fabState.csEditables, cn] : [];
        const mecanizado = [];
        let acum = fabState.b1;
        mecanizado.push(acum); // B1
        for (const c of allCs) {
            acum += c;
            mecanizado.push(acum);
        }

        // ¿Reparto equidistante original? Detección autónoma (no depende de fabricacion.js):
        // equidistante ≡ B1/B2 en su valor por defecto Y todas las C iguales entre sí
        // (Cn puede diferir 1 céntimo por el redondeo del reparto).
        let esEquidistante = false;
        if (n > 1) {
            const B1def = (CONFIG.bisagras_B1_defecto ?? CONFIG.bisagras_B_minimo ?? 100);
            const B2def = (CONFIG.bisagras_B2_defecto ?? CONFIG.bisagras_B_minimo ?? 100);
            const igual = (a, b) => Math.abs(a - b) < 0.02;
            const bOk = igual(fabState.b1, B1def) && igual(fabState.b2, B2def);

            // allCs = [C1..Cn-1 editables, Cn]. Las editables deben ser iguales entre sí;
            // Cn puede diferir por el redondeo del reparto (absorbe el resto).
            let csUniformes = true;
            const editables = fabState.csEditables;
            if (editables.length > 0) {
                const ref = editables[0];
                for (const c of editables) {
                    if (Math.abs(c - ref) > 0.02) { csUniformes = false; break; }
                }
                // Cn (último de allCs) puede desviarse hasta ~0,5 mm por redondeo acumulado
                const cnVal = allCs[allCs.length - 1];
                if (Math.abs(cnVal - ref) > 0.5) csUniformes = false;
            }
            esEquidistante = bOk && csUniformes;
        }

        // ── CABECERA (estilo A4 presupuesto: fondo blanco + borde inferior) ──
        const AZUL = [45, 58, 75];   // #2D3A4B

        // Logo Adinor (versión negra del ecosistema)
        const logoUrl = 'https://jdurba.github.io/General/img/LOGO_2025_Negro.png';
        const logoData = await cargarImagenComoData(logoUrl, 34, 13, 'PNG');
        if (logoData) {
            const logoFit = fitImageInBox(logoData.naturalWidth, logoData.naturalHeight, 34, 13);
            pdf.addImage(logoData.dataUrl, 'PNG', mL + logoFit.offsetX, 8 + logoFit.offsetY, logoFit.w, logoFit.h);
        } else {
            pdf.setTextColor(...AZUL);
            pdf.setFontSize(16);
            pdf.setFont('helvetica', 'bold');
            pdf.text('ADINOR', mL, 15);
        }

        pdf.setTextColor(...AZUL);
        pdf.setFontSize(15);
        pdf.setFont('helvetica', 'bold');
        // Centrado en el espacio entre el logo y el margen derecho
        const tituloLeft = mL + 34 + 6;   // fin del logo (ancho 34) + holgura
        const tituloCentro = tituloLeft + (W - mR - tituloLeft) / 2;
        pdf.text('HOJA DE FABRICACIÓN DE VITRINAS', tituloCentro, 14, { align: 'center' });

        // Borde inferior de cabecera (fina y separada del logo)
        pdf.setDrawColor(...AZUL);
        pdf.setLineWidth(0.4);
        pdf.line(mL, 23, W - mR, 23);
        y = 31;

        // Helper: barra de sección estilo A4 (gris con texto oscuro mayúsculas)
        function seccion(texto, xx, ancho, yy) {
            pdf.setFillColor(215, 216, 214);   // #d7d8d6
            pdf.setDrawColor(183, 184, 182);   // #b7b8b6
            pdf.setLineWidth(0.3);
            pdf.rect(xx, yy, ancho, 5.5, 'FD');
            pdf.setTextColor(51, 51, 51);      // #333
            pdf.setFontSize(8); pdf.setFont('helvetica', 'bold');
            pdf.text(texto.toUpperCase(), xx + 3, yy + 3.8);
        }

        // ── CAMPOS ──
        pdf.setTextColor(100, 100, 100);
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'normal');

        const campoIzq = mL;
        const campoDer = W / 2 + 5;

        // gapLabel: separación etiqueta→valor; anchoLinea: largo del subrayado desde el valor
        function campoPDF(x, yy, label, valor, gapLabel, anchoLinea) {
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(120, 120, 120);
            pdf.text(label, x, yy);
            const valX = x + gapLabel;
            if (valor) {
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(30, 30, 30);
                pdf.text(valor, valX, yy);
            }
            // Línea bajo el valor, pegada a la etiqueta
            pdf.setDrawColor(200, 200, 200);
            pdf.setLineWidth(0.3);
            pdf.line(valX - 1, yy + 1, valX + anchoLinea, yy + 1);
        }

        // Izquierda: Nº Pedido / Cliente (bloque más largo). Derecha: Fecha / Cantidad.
        campoPDF(campoIzq, y,      'Nº Pedido', pedido,  20, 68);
        campoPDF(campoDer, y,      'Fecha',     fecha,   20, 45);
        campoPDF(campoIzq, y + 7,  'Cliente',   cliente, 20, 68);
        campoPDF(campoDer, y + 7,  'Cantidad',  `${state.cantidad} unidad${state.cantidad > 1 ? 'es' : ''}`, 20, 45);
        y += 16;

        // ── PERFIL + ACABADO (texto) ──
        // Intentar cargar imagen del perfil
        const perfilUrl = `https://raw.githubusercontent.com/Jdurba/Vitrinas/main/Imagenes/${m?.imagen || state.modelo}_cotas.jpg`;
        const perfilImg = await cargarImagenComoData(perfilUrl, 52, 26, 'JPEG');

        const imgBoxW = 52, imgBoxH = 26;
        if (perfilImg) {
            const fit = fitImageInBox(perfilImg.naturalWidth, perfilImg.naturalHeight, imgBoxW, imgBoxH);
            pdf.addImage(perfilImg.dataUrl, 'JPEG', mL + fit.offsetX, y + fit.offsetY, fit.w, fit.h);
        } else {
            pdf.setDrawColor(200); pdf.setFillColor(245, 245, 245);
            pdf.rect(mL, y, imgBoxW, imgBoxH, 'FD');
            pdf.setFontSize(7); pdf.setTextColor(160);
            pdf.text('Imagen perfil', mL + imgBoxW / 2, y + imgBoxH / 2, { align: 'center' });
        }

        const datosX = mL + imgBoxW + 8;
        pdf.setFontSize(10);
        pdf.setTextColor(...AZUL);

        // Cursor Y incremental: cada línea avanza 6 mm. Así las líneas
        // opcionales (especiales) se insertan sin descuadrar las siguientes.
        let lineY = y + 6;
        const LH = 6;

        pdf.setFont('helvetica', 'bold');
        pdf.text(`Perfil: ${state.modelo} — ${m?.nombre || ''}`, datosX, lineY);
        lineY += LH;

        pdf.setFont('helvetica', 'normal');
        pdf.text(`Acabado: ${a?.nombre || '—'}`, datosX, lineY);
        lineY += LH;

        if (state.acabado === 'ESP' && state.acabadoEspecial) {
            pdf.text(`Acabado especial: ${state.acabadoEspecial}`, datosX, lineY);
            lineY += LH;
        }

        let vidrioTexto = 'No';
        if (tieneVidrio) {
            vidrioTexto = 'Sí';
            if (state.colorVidrio) vidrioTexto += ` — ${formatearColorVidrio(state.colorVidrio)}`;
        }
        pdf.text(`Vidrio: ${vidrioTexto}`, datosX, lineY);
        lineY += LH;

        if (state.colorVidrio === 'especial' && state.vidrioEspecial) {
            pdf.text(`Vidrio especial: ${state.vidrioEspecial}`, datosX, lineY);
            lineY += LH;
        }

        // Medidas del vidrio real (alto × ancho): SIEMPRE se muestran,
        // el taller las necesita aunque el vidrio no vaya montado.
        pdf.text(`Medidas vidrio: ${vidrioAltura} × ${vidrioAncho} mm`, datosX, lineY);
        lineY += LH;

        // Avanzar bajo lo más alto: caja de imagen o bloque de texto.
        y = Math.max(y + imgBoxH, lineY - LH) + 6;

        // ── LÍNEA SEPARADORA ──
        pdf.setDrawColor(...AZUL); pdf.setLineWidth(0.3);
        pdf.line(mL, y, W - mR, y);
        y += 5;

        // ═══════════════════════════════════════
        // ÁREA BAJO CABECERA: dos bloques iguales
        //   Bloque 2 (Bisagras): puerta + grid | vista trasera
        //   Bloque 3 (Tirador):  texto tirador | vista frontal
        // ═══════════════════════════════════════
        const colIzqW = contentW - 72;  // ~110mm
        const colDerW = 68;             // para SVGs
        const colDerX = mL + colIzqW + 4;

        const areaTop = y;              // inicio del área (tras separador)
        const areaBottom = H - mB;      // sin pie: hasta el margen inferior
        const bloqueAlto = (areaBottom - areaTop) / 2;

        // Banda reservada al pie de la columna izquierda para la conformidad
        // del cliente. Es fija: no depende de dónde acabe el tirador ni la nota.
        const CONF_H   = 38;
        const confTop  = areaBottom - CONF_H;
        const bloque2Top = areaTop;
        const bloque3Top = areaTop + bloqueAlto;
        const yStartCols = areaTop;

        // ── COL IZQ: Tabla dimensiones puerta ──
        seccion('Dimensiones de la puerta', mL, colIzqW, y);
        y += 7;

        // Tablas indentadas respecto a la barra de sección (sangría)
        const SANGRIA = 12;
        const tblX = mL + SANGRIA;
        pdf.setFontSize(8.5); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(60);
        pdf.setFillColor(232, 232, 232);
        pdf.rect(tblX, y, 40, 5, 'FD'); pdf.rect(tblX + 40, y, 40, 5, 'FD');
        pdf.text('Altura Y (mm)', tblX + 20, y + 3.5, { align: 'center' });
        pdf.text('Anchura X (mm)', tblX + 60, y + 3.5, { align: 'center' });
        y += 5;
        pdf.setFont('helvetica', 'normal'); pdf.setTextColor(30);
        pdf.setFillColor(255);
        pdf.rect(tblX, y, 40, 5.5, 'D'); pdf.rect(tblX + 40, y, 40, 5.5, 'D');
        pdf.text(String(state.alturaReal), tblX + 20, y + 4, { align: 'center' });
        pdf.text(String(state.anchoReal),  tblX + 60, y + 4, { align: 'center' });
        y += 8;

        // ── COL IZQ: Bisagras ──
        const manoTexto = fabState.mano === 'izquierda' ? 'Mano izquierda' : 'Mano derecha';
        seccion(`Bisagras — ${manoTexto}`, mL, colIzqW, y);
        y += 7;

        // Nº bisagras
        pdf.setFontSize(8.5); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(60);
        pdf.setFillColor(232, 232, 232);
        pdf.rect(tblX, y, 54, 5, 'FD');
        pdf.text(`Nº Bisagras: ${n}`, tblX + 27, y + 3.5, { align: 'center' });
        y += 6;

        if (sinMec) {
            pdf.setFontSize(8); pdf.setFont('helvetica', 'italic'); pdf.setTextColor(120);
            pdf.text('Marco limpio — sin mecanizado de bisagras', mL + 3, y + 3);
            y += 7;
        } else if (!bisagrasFijas) {
            // Cabecera tabla
            pdf.setFillColor(232, 232, 232);
            pdf.rect(tblX, y, 18, 5, 'FD'); pdf.rect(tblX + 18, y, 25, 5, 'FD'); pdf.rect(tblX + 43, y, 25, 5, 'FD');
            pdf.setFontSize(8); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(60);
            pdf.text('', tblX + 9, y + 3.5, { align: 'center' });
            pdf.text('Medida (mm)', tblX + 30.5, y + 3.5, { align: 'center' });
            pdf.text('Mecanizado', tblX + 55.5, y + 3.5, { align: 'center' });
            y += 5;

            // Filas: B1
            pdf.setFont('helvetica', 'normal'); pdf.setTextColor(30);
            pdf.rect(tblX, y, 18, 5, 'D'); pdf.rect(tblX + 18, y, 25, 5, 'D'); pdf.rect(tblX + 43, y, 25, 5, 'D');
            pdf.text('B1', tblX + 9, y + 3.5, { align: 'center' });
            pdf.text(fmt(fabState.b1), tblX + 30.5, y + 3.5, { align: 'center' });
            pdf.text(fmt(mecanizado[0]), tblX + 55.5, y + 3.5, { align: 'center' });
            y += 5;

            // Filas: C1..Cn
            for (let i = 0; i < allCs.length; i++) {
                pdf.rect(tblX, y, 18, 5, 'D'); pdf.rect(tblX + 18, y, 25, 5, 'D'); pdf.rect(tblX + 43, y, 25, 5, 'D');
                pdf.text(`C${i + 1}`, tblX + 9, y + 3.5, { align: 'center' });
                pdf.text(fmt(allCs[i]), tblX + 30.5, y + 3.5, { align: 'center' });
                pdf.text(fmt(mecanizado[i + 1]), tblX + 55.5, y + 3.5, { align: 'center' });
                y += 5;
            }

            // B2
            pdf.rect(tblX, y, 18, 5, 'D'); pdf.rect(tblX + 18, y, 25, 5, 'D'); pdf.rect(tblX + 43, y, 25, 5, 'D');
            pdf.text('B2', tblX + 9, y + 3.5, { align: 'center' });
            pdf.text(fmt(fabState.b2), tblX + 30.5, y + 3.5, { align: 'center' });
            pdf.text('—', tblX + 55.5, y + 3.5, { align: 'center' });
            y += 6;

            // Nota: reparto equidistante original (solo si no se ha editado ninguna cota)
            if (esEquidistante) {
                pdf.setFontSize(7.5); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(34, 139, 58);
                pdf.text('Medidas equidistantes (reparto automático)', tblX, y + 3);
                y += 4;
            }
            y += 1;
        } else {
            pdf.setFontSize(8); pdf.setFont('helvetica', 'italic'); pdf.setTextColor(120);
            pdf.text('Posición de bisagras fija para este perfil', mL + 3, y + 3);
            y += 7;
        }

        // ── COL IZQ: Tirador (arranca en el inicio del bloque 3) ──
        y = bloque3Top;
        if (tieneTirador) {
            seccion('Tirador mecanizado', mL, colIzqW, y);
            y += 7;

            // Imagen tirador
            const tirador = CONFIG.tiradores[state.tiradorTipo];
            const tiradorImg = tirador ? await cargarImagenComoData(tirador.imagen, 36, 17, 'JPEG') : null;

            const tBoxW = 36, tBoxH = 17;
            if (tiradorImg) {
                const tFit = fitImageInBox(tiradorImg.naturalWidth, tiradorImg.naturalHeight, tBoxW, tBoxH);
                pdf.addImage(tiradorImg.dataUrl, 'JPEG', mL + tFit.offsetX, y + tFit.offsetY, tFit.w, tFit.h);
            } else {
                pdf.setDrawColor(200); pdf.setFillColor(245, 245, 245);
                pdf.rect(mL, y, tBoxW, tBoxH, 'FD');
                pdf.setFontSize(6); pdf.setTextColor(160);
                pdf.text('Tirador', mL + tBoxW / 2, y + tBoxH / 2, { align: 'center' });
            }

            const tDatosX = mL + tBoxW + 5;
            pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...AZUL);
            pdf.text(`Tirador ${tirador?.medidas || state.tiradorTipo}`, tDatosX, y + 5);

            pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); pdf.setTextColor(60);
            const posLabel = fabState.tiradorPos === 'opuesto'
                ? `Opuesto (${fabState.mano === 'izquierda' ? 'derecha' : 'izquierda'})`
                : fabState.tiradorPos;
            pdf.text(`Posición: ${posLabel}`, tDatosX, y + 10.5);

            pdf.setFont('helvetica', 'bold'); pdf.setTextColor(30, 30, 30);
            pdf.text(`Medida Z: ${fabState.tiradorZ} mm`, tDatosX, y + 16);

            y += tBoxH + 4;
        } else {
            // ── Sin tirador: aviso en columna izquierda, estilo normal ──
            seccion('Tirador mecanizado', mL, colIzqW, y);
            y += 7;

            pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...AZUL);
            pdf.text('Sin tirador mecanizado', mL + 3, y + 4);
            y += 8;
        }

        // ── COL IZQ: Observaciones (nota de cabecera) ──
        // El break es la red de seguridad: si algún día sube el límite de 250
        // caracteres, el texto se corta en el margen inferior en vez de
        // desbordar la hoja (este layout no tiene paginación).
        const notaFab = (state.nota || '').trim();
        if (notaFab) {
            y += 3;
            seccion('Observaciones', mL, colIzqW, y);
            y += 7;
            pdf.setFontSize(8.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(60);
            for (const ln of pdf.splitTextToSize(notaFab, colIzqW - 6)) {
                if (y > confTop - 6) break;   // el recuadro de conformidad manda
                pdf.text(ln, mL + 3, y + 3);
                y += 4.5;
            }
        }

        // ── COL IZQ: CONFORMIDAD DEL CLIENTE (solo PDF) ──
        // Posición fija al pie de la columna izquierda: el cliente firma el
        // diseño sobre esta misma hoja, así que debe salir siempre en el
        // mismo sitio, con o sin tirador y con o sin observaciones.
        seccion('Conforme con el diseño', mL, colIzqW, confTop);
        pdf.setDrawColor(183, 184, 182);
        pdf.setLineWidth(0.3);
        pdf.rect(mL, confTop, colIzqW, CONF_H, 'S');

        const firmaY  = confTop + CONF_H - 5;
        const fechaX  = mL + colIzqW * 0.70;
        pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(100, 100, 100);
        pdf.text('Firmado:', mL + 3, firmaY);
        pdf.text('Fecha:',   fechaX, firmaY);
        pdf.setDrawColor(200, 200, 200);
        pdf.line(mL + 17, firmaY + 1, fechaX - 5,           firmaY + 1);
        pdf.line(fechaX + 12, firmaY + 1, mL + colIzqW - 3, firmaY + 1);

        // ── COLUMNA DERECHA: cada vista ocupa su bloque completo ──
        // Dibujo VECTORIAL NATIVO (primitivas jsPDF) → PDF ligero y nítido.
        const CAP = 4;              // hueco para el caption bajo cada dibujo
        const GAP = 3;              // margen interno del bloque
        const ratio = 560 / 400;    // alto/ancho del dibujo (VH/VW)

        const altoTrasDisp  = bloqueAlto - CAP - GAP;
        const altoFrontDisp = bloqueAlto - CAP - GAP;

        function dibujarVista(dibujarFn, yTop, altoDisp, caption) {
            let h = altoDisp;
            let w = h / ratio;
            if (w > colDerW) { w = colDerW; h = w * ratio; }   // limitar por ancho
            const x = colDerX + (colDerW - w) / 2;             // centrar horizontal

            dibujarFn(pdf, x, yTop, w, h);

            pdf.setFontSize(6.5); pdf.setTextColor(150); pdf.setFont('helvetica', 'normal');
            pdf.text(caption, colDerX + colDerW / 2, yTop + h + CAP - 1, { align: 'center' });
        }

        dibujarVista(pdfDibujarTrasera, bloque2Top, altoTrasDisp, 'Vista trasera — bisagras');
        dibujarVista(pdfDibujarFrontal, bloque3Top, altoFrontDisp, tieneTirador ? 'Vista frontal — tirador' : 'Vista frontal');

        // ── VERSIÓN (traza mínima, sin línea de pie para ganar espacio) ──
        if (window.VERSION_APP) {
            pdf.setFontSize(5.5); pdf.setTextColor(200);
            pdf.text(`Adinor · Vitrinas · ${window.VERSION_APP}`, W - mR, H - 4, { align: 'right' });
        }

        // ── TRAZABILIDAD (solo si la configuración viene de un fichero) ──
        // Va a la izquierda del pie y lleva el pedido/cliente ORIGINALES.
        const trazaFab = (typeof lineaTrazabilidad === 'function') ? lineaTrazabilidad() : '';
        if (trazaFab) {
            pdf.setFontSize(5.5); pdf.setTextColor(160);
            pdf.text(trazaFab, mL, H - 4);
        }

        // ── NOMBRE Y DESCARGA ──
        const nombreArchivo = pedido
            ? `Vitrina-${pedido}-${cliente || 'sin-ref'}-${fecha.replace(/\//g, '-')}.pdf`
            : `Vitrina-${fecha.replace(/\//g, '-')}.pdf`;

        pdf.save(nombreArchivo);

    } catch (error) {
        console.error('Error generando PDF:', error);
        aviso(`Error al generar PDF:\n${error.message}`);
    } finally {
        if (btn) {
            btn.textContent = '📄 Generar PDF';
            btn.style.pointerEvents = '';
        }
    }
}

// ── INICIALIZACIÓN ───────────────────────────────────
function inicializarPDFVitrinas() {
    const btn = document.getElementById('fabBtnPDF');
    if (!btn) return;

    // Único listener del botón. El estado disabled lo gestiona
    // fabricacion.js (actualizarEstadoPDF) según la captura de bisagras.
    btn.addEventListener('click', lanzarPDFVitrinas);
}

document.addEventListener('DOMContentLoaded', inicializarPDFVitrinas);
