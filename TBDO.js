//VERSION=3
/*
Chl-a (Modelo de 3 Bandas - TBDO) con Máscara de Agua SWBM
- Máscara de Agua: SWBM (Mohor Gartner)
- Chl-a: TBDO = R740 * (1/R665 - 1/R705)
*/

// UMBRALES DEL SWBM
const MNDWI_thr = 0.1;
const NDWI_thr = 0.2;
const SWI_thr = 0.03;

function setup() {
    return {
        // AÑADIDA B06 (R740) necesaria para el nuevo índice
        input: ["B02", "B03", "B04", "B05", "B06", "B08", "B11", "SCL", "dataMask"],
        output: [
            { id: "default", bands: 4 }, 
            { id: "index", bands: 1, sampleType: 'FLOAT32' },
            { id: "eobrowserStats", bands: 2, sampleType: 'FLOAT32' }, 
            { id: "dataMask", bands: 1 }
        ]
    };
}

// 1. FUNCIÓN MATEMÁTICA PARA MÁSCARA
function calcIndex(b1, b2) {
    return (b1 - b2) / (b1 + b2);
}

// 2. LA MÁSCARA DE AGUA (SWBM)
function getWaterMask(p) {
    let isCloud = false;
    let isWater = 0;
    
    // Filtro de nubes SCL
    if ([8, 9].includes(p.SCL)) {
        isCloud = true;
    }

    if (!isCloud) {
        let mndwi = calcIndex(p.B03, p.B11);
        let ndwi = calcIndex(p.B03, p.B08);
        let swi = calcIndex(p.B05, p.B11);

        if (mndwi > MNDWI_thr || ndwi > NDWI_thr || swi > SWI_thr) {
            isWater = 1;
        }
    }

    return {
        agua: isWater,
        nube: isCloud ? 1 : 0
    };
}

// 3. PALETA DE COLORES PARA CHL-A (µg/L)
// PALETA UNIFICADA DE CHL-A PARA TODOS LOS MODELOS (0 a 500+ µg/L)
const chlaStops = [0, 15, 30, 50, 100, 250, 500]; 
const chlaColors = [
    [0.0, 0.0, 0.5], // 0: Azul oscuro (Agua clara / Oligotrófica)
    [0.2, 0.6, 1.0], // 15: Azul claro
    [0.0, 0.8, 0.4], // 30: Verde (Inicio de floración algal)
    [0.8, 1.0, 0.0], // 50: Amarillo verdoso
    [1.0, 0.6, 0.0], // 100: Naranja (Estado Eutrófico)
    [1.0, 0.0, 0.0], // 250: Rojo (Estado Hipertrófico)
    [0.6, 0.0, 0.8]  // 500: Morado (Bloom extremo / "Sopa verde" hiperconcentrada)
];

// 4. FUNCIÓN PRINCIPAL
function evaluatePixel(p) {
    let mascara = getWaterMask(p);
    
    // Color natural para tierra
    let colorTierra = [p.B04 * 2.5, p.B03 * 2.5, p.B02 * 2.5, p.dataMask];
    
    let outColor = colorTierra;
    let indexVal = NaN; // NoData por defecto

    // Si es agua, calculamos el modelo TBDO
    if (mascara.agua === 1) {
        
        // Asignación de bandas (con protección contra división por cero)
        let r665 = Math.max(p.B04, 0.0001); // B04
        let r705 = Math.max(p.B05, 0.0001); // B05
        let r740 = p.B06;                   // B06

        // ECUACIÓN 2: Cálculo del TBDO
        let tbdo = r740 * ((1 / r665) - (1 / r705));
        
        // ECUACIÓN 1: Cálculo final de Chl-a (µg/L)
        indexVal = tbdo;
        
        // Transformamos el valor de µg/L a un color en el mapa
        let colorCHLA = colorBlend(indexVal, chlaStops, chlaColors);
        colorCHLA.push(p.dataMask);
        outColor = colorCHLA;
    }

    return {
        default: outColor,
        index: [indexVal], // En la herramienta estadística verás directamente el valor en µg/L
        eobrowserStats: [indexVal, mascara.nube],
        dataMask: [p.dataMask]
    };
}
