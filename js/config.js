// ==========================================
// CONFIGURACIÓN GLOBAL
// ==========================================
const CONFIG = {

    bisagras_rangos: [
        { hasta: 900,  num: 2 },
        { hasta: 1600, num: 3 },
        { hasta: 2000, num: 4 },
        { hasta: 2500, num: 5 },
        { hasta: 2800, num: 6 }
    ],
    bisagras_B1_defecto: 100,
    bisagras_B2_defecto: 100,
    bisagras_B_minimo:    70,
    bisagras_C_minimo:    80,
    bisagras_max_global:   6,

    // Holgura mínima entre el extremo del tirador y el borde de la puerta (mm).
    // De aquí se derivan, sin más tablas:
    //   Z mínima          = tirador_borde_minimo + largoMm/2
    //   Z máxima          = dimensión − Z mínima
    //   dimensión mínima  = largoMm + 2 × tirador_borde_minimo
    // Si cambia esta holgura, se recalcula todo solo.
    tirador_borde_minimo: 60,
    modelos: {
        // sinTirador: true → el perfil no admite tirador mecanizado (independiente de bisagras_fijas)
        // codeTipo → 2 dígitos para composición del código Odoo: VV.{codeTipo}{00|01}.{familiaAcabado}
        //
        // Redundancias INTENCIONADAS (tabla explícita > tabla derivada al añadir un perfil):
        //   · sinTirador coincide siempre con la ausencia de tiradoresValidos.
        //   · bisagras_fijas coincide siempre con tener tipobisagra en bisagras.imagenesFijas.
        //   · codeTipo salta de '11' a '21': el bloque 2x queda reservado a perfiles de
        //     bisagra fija (KABI/HAVA). No es un hueco por modelos eliminados.
        // Al añadir un perfil hay que rellenar ambos lados de cada par.
        '7991':   { nombre: '20x45 P8',      maxAltura: 2500, maxAncho: 600, minAltura: 220, minAncho: 150, imagen: '7991',   acabados: ['PM','P','B','BM03','NM','RB','NG'], DescV_Alt: 5, DescV_Anc: 5, codeTipo: '01', denominacion: 'VITRINA 20X45 P8', tipobisagra: 'D35',  tiradoresValidos: ['79971','7997','7794'] },
        '7994':   { nombre: '20x45 P4',      maxAltura: 2500, maxAncho: 600, minAltura: 220, minAncho: 150, imagen: '7994',   acabados: ['PM','P','B','NM'], DescV_Alt: 5, DescV_Anc: 5, codeTipo: '02', denominacion: 'VITRINA 20X45 P4' , tipobisagra: 'D35',  tiradoresValidos: ['79971','7997','7794'] },
        '7995':   { nombre: '35x45 P8',      maxAltura: 2800, maxAncho: 600, minAltura: 220, minAncho: 150, imagen: '7995',   acabados: ['PM','P','B','BM03','NM'], DescV_Alt: 5, DescV_Anc: 5, sinTirador: true, codeTipo: '03', denominacion: 'VITRINA 35X45 P8' , tipobisagra: 'D35' },
        '7990':   { nombre: '20x45 P20',     maxAltura: 2500, maxAncho: 600, minAltura: 220, minAncho: 150, imagen: '7990',   acabados: ['PM','P','B','NM'], DescV_Alt: 29, DescV_Anc: 29, codeTipo: '04', denominacion: 'VITRINA 20X45 P20' , tipobisagra: 'D35',  tiradoresValidos: ['79971','7997','7794'] },
        '7998':   { nombre: '20x45 P45',     maxAltura: 2500, maxAncho: 600, minAltura: 220, minAncho: 150, imagen: '7998',   acabados: ['PM','P','B','NM'], DescV_Alt: 80, DescV_Anc: 80, codeTipo: '05', denominacion: 'VITRINA 20X45 P45' , tipobisagra: 'D35',   tiradoresValidos: ['79971','7997','7794'] },
        '7993':   { nombre: '19x21',         maxAltura: 2500, maxAncho: 600, minAltura: 220, minAncho: 150, imagen: '7993',   acabados: ['PM','P','B','NM','RB','NG'], DescV_Alt: 28, DescV_Anc: 28, codeTipo: '06', denominacion: 'VITRINA 19X21' , tipobisagra: 'ALU20',  tiradoresValidos: ['79971','7997'] },
        '7996':   { nombre: '20x18 P8',      maxAltura: 2500, maxAncho: 600, minAltura: 220, minAncho: 150, imagen: '7996',   acabados: ['PM','P','B','NM','RB','NG'], DescV_Alt: 5, DescV_Anc: 5, codeTipo: '07', denominacion: 'VITRINA 20X18 P8' , tipobisagra: 'ALU20',  tiradoresValidos: ['79971','7997'] },
        '7999':   { nombre: '16x60 S/P',     maxAltura: 2500, maxAncho: 600, minAltura: 220, minAncho: 150, imagen: '7999',   acabados: ['PM','P','B','NM'], DescV_Alt: 1, DescV_Anc: 1, sinTirador: true, codeTipo: '08', denominacion: 'VITRINA 16X60 S/P' , tipobisagra: 'D35'  },
        '79916':  { nombre: '20x56 C/P',     maxAltura: 2500, maxAncho: 600, minAltura: 220, minAncho: 150, imagen: '79916',  acabados: ['PM','P','B','NM'], DescV_Alt: 5, DescV_Anc: 5, codeTipo: '09', denominacion: 'VITRINA 20X56 C/P' , tipobisagra: 'D35',    tiradoresValidos: ['79971','7997','7794'] },
        'BT100':  { nombre: 'Perfil BT-10',  maxAltura: 2500, maxAncho: 600, minAltura: 220, minAncho: 150, imagen: 'BT100',  acabados: ['PM','P','B','NM'], DescV_Alt: 24, DescV_Anc: 24, codeTipo: '10', denominacion: 'VITRINA PERFIL BT100' , tipobisagra: 'D35-S',   tiradoresValidos: ['7794'] },
        'BT110':  { nombre: 'Perfil BT-60',  maxAltura: 2700, maxAncho: 600, minAltura: 220, minAncho: 150, imagen: 'BT110',  acabados: ['PM','P','B','NM'], DescV_Alt: 93, DescV_Anc: 93, codeTipo: '11', denominacion: 'VITRINA PERFIL BT110' , tipobisagra: 'D35',    tiradoresValidos: ['7794'] },
        'KABI':   { nombre: 'Perfiles KABI', maxAltura: 2800, maxAncho: 600, minAltura: 400, minAncho: 150, imagen: 'Kabi',   acabados: ['BM03','NM','BR'], bisagras_fijas: 2, DescV_Alt: 6, DescV_Anc: 24, sinTirador: true, codeTipo: '21', denominacion: 'VITRINA PERFILES KABI' , tipobisagra: 'KABI'  },
        'HAVA':   { nombre: 'Perfiles HAVA', maxAltura: 2800, maxAncho: 600, minAltura: 350, minAncho: 150, imagen: 'Hava',   acabados: ['BM03','NM','BR'], bisagras_fijas: 2, DescV_Alt: 7, DescV_Anc: 7, sinTirador: true, codeTipo: '22', denominacion: 'VITRINA PERFILES HAVA' , tipobisagra: 'HAVA'  },
        'HAVASP': { nombre: 'Perfiles HAVA S/P', maxAltura: 2800, maxAncho: 600, minAltura: 350, minAncho: 150, imagen: 'HavaSP', acabados: ['BM03','NM','BR'], bisagras_fijas: 2, DescV_Alt: 7, DescV_Anc: 7, sinTirador: true, codeTipo: '23', denominacion: 'VITRINA HAVA S/P' , tipobisagra: 'HAVA'   }
    },
    acabados: {
        // grupoPrecio → columna Acabado del CSV de tarifas
        // codigo/denominacion → composición de código y denominación Odoo
        'PM':   { nombre: 'Plata Mate (A.PM)',          grupoPrecio: 'ANODIZADO', codigo: 'A.PM',   denominacion: 'ANOD PLATA MATE' },
        'P':    { nombre: 'Plata Brillo (A.P)',         grupoPrecio: 'ANODIZADO', codigo: 'A.P',    denominacion: 'ANOD PLATA BRILLO' },
        'B':    { nombre: 'Lacado Blanco Brillo (L.B)', grupoPrecio: 'LACADO',    codigo: 'L.B',    denominacion: 'LAC BLANCO BRILLO' },
        'BM03': { nombre: 'Blanco Mate 9003 (L.BM03)',  grupoPrecio: 'LACADO',    codigo: 'L.BM03', denominacion: 'LAC BLANCO MATE 9003' },
        'NM':   { nombre: 'Lacado Negro Mate (L.NM)',   grupoPrecio: 'LACADO',    codigo: 'L.NM',   denominacion: 'LAC NEGRO MATE' },
        'BR':   { nombre: 'Bronce Cepillado (A.BR)',    grupoPrecio: 'ANODIZADO', codigo: 'A.BR',   denominacion: 'ANOD BRONCE CEPILLADO' },
        'RB':   { nombre: 'Chapa Roble (C.RB)',         grupoPrecio: 'RECHAPADO', codigo: 'C.RB',   denominacion: 'CHAPA ROBLE' },
        'NG':   { nombre: 'Chapa Nogal (C.NG)',         grupoPrecio: 'RECHAPADO', codigo: 'C.NG',   denominacion: 'CHAPA NOGAL' },
        'ESP':  { nombre: 'Especial (ESP)',             grupoPrecio: 'CONSULTAR', codigo: 'ESP',    denominacion: 'ACABADO ESPECIAL' }
    },
    // Familia de acabado para el código Odoo. Derivada de grupoPrecio: un
    // acabado nuevo hereda su letra sin tocar esta tabla.
    codeAcabPorGrupo: { ANODIZADO: 'A', LACADO: 'L', RECHAPADO: 'C', CONSULTAR: 'E' },
    coloresVidrio: {
        // grupoPrecio → columna ColorVidrio del CSV de tarifas (CONSULTAR = sin precio, consultar siempre)
        // El color no interviene en el código: solo en denominación y precio.
        'transparente': { nombre: 'Transparente', grupoPrecio: 'TRANSPARENTE', denominacion: 'VIDRIO TRANSPARENTE' },
        'mate':         { nombre: 'Mate',         grupoPrecio: 'MATE',         denominacion: 'VIDRIO MATE' },
        'bronce':       { nombre: 'Bronce',       grupoPrecio: 'COLORMIX01',   denominacion: 'VIDRIO BRONCE' },
        'gris':         { nombre: 'Gris',         grupoPrecio: 'COLORMIX01',   denominacion: 'VIDRIO GRIS' },
        'grisoscuro':   { nombre: 'Gris oscuro',  grupoPrecio: 'GRISOSCURO',   denominacion: 'VIDRIO GRIS OSCURO' },
        'especial':     { nombre: 'Especial',     grupoPrecio: 'CONSULTAR',    denominacion: 'VIDRIO ESPECIAL' }
    },
    // largoMm → largo REAL del tirador (corte de fabricación).
    // OJO: no coincide con el primer número de 'medidas', que es la sección
    // (37x16x150, 48x14x150). 'medidas' es texto de presentación; para
    // cualquier cálculo de cotas se usa largoMm.
    tiradores: {
        '79971': {
            nombre: 'Tirador 126x35',
            medidas: '126 × 35 mm',
            largoMm: 126,
            acabados: ['PM','P','B','BM03','NM','ESP'],
            imagen: 'https://raw.githubusercontent.com/Jdurba/Vitrinas/main/Imagenes/126x35.jpg'
        },
        '7997': {
            nombre: 'Tirador 37x16',
            medidas: '37 × 16 mm',
            largoMm: 150,
            acabados: ['PM','P','B','BM03','NM','RB','NG','ESP'],
            imagen: 'https://raw.githubusercontent.com/Jdurba/Vitrinas/main/Imagenes/37x16.jpg'
        },
        '7794': {
            nombre: 'Tirador 48x14',
            medidas: '48 × 14 mm',
            largoMm: 150,
            acabados: ['PM','P','B','BM03','NM','ESP'],
            imagen: 'https://raw.githubusercontent.com/Jdurba/Vitrinas/main/Imagenes/48x14.jpg'
        }
    },
    // Bisagras adjuntadas como producto (se seleccionan en la hoja de fabricación
    // cuando adjuntarBisagras = true). Se usan luego para buscar artículos en tarifa.
    bisagras: {
        montajes: {
            'recta':        { nombre: 'Recta',         imagen: 'https://raw.githubusercontent.com/Jdurba/Vitrinas/main/Imagenes/Recta.jpg' },
            'acodada':      { nombre: 'Acodada',       imagen: 'https://raw.githubusercontent.com/Jdurba/Vitrinas/main/Imagenes/Acodada.jpg' },
            'superacodada': { nombre: 'Super Acodada', imagen: 'https://raw.githubusercontent.com/Jdurba/Vitrinas/main/Imagenes/SuperAcodada.jpg' }
        },
        bases: {
            '16': { nombre: '16 mm' },
            '19': { nombre: '19 mm' }
        },
        colores: {
            'negro':     { nombre: 'Negro' },
            'niquelado': { nombre: 'Niquelado' }
        },
        // Imagen de base según costado seleccionado (16/19). Alterna con los botones.
        imagenBasePorCota: {
            '16': 'https://raw.githubusercontent.com/Jdurba/Vitrinas/main/Imagenes/Bases16.jpg',
            '19': 'https://raw.githubusercontent.com/Jdurba/Vitrinas/main/Imagenes/Bases19.jpg'
        },
        // Bisagras de posición fija (KABI/HAVA): nada que seleccionar, solo informar.
        // Imagen indexada por tipobisagra del modelo.
        imagenesFijas: {
            'KABI': 'https://raw.githubusercontent.com/Jdurba/Vitrinas/main/Imagenes/Kabi.jpg',
            'HAVA': 'https://raw.githubusercontent.com/Jdurba/Vitrinas/main/Imagenes/Hava.jpg'
        }
    }
};
