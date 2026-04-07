//VERSION=3
/*
NDCI (Chlorophyll-a) over SWBM Water Mask
- Water Mask based on SWBM by Mohor Gartner
- NDCI by Sachidananda Mishra (2012)
*/

// UMBRALES DEL SWBM
const MNDWI_thr = 0.1;
const NDWI_thr = 0.2;
const SWI_thr = 0.03;

function setup() {
    return {
        input: ["B02", "B03", "B04", "B05", "B08", "B11", "SCL", "dataMask"],
        output: [
            { id: "default", bands: 4 }, 
            { id: "index", bands: 1, sampleType: 'FLOAT32' },
            { id: "eobrowserStats", bands: 2, sampleType: 'FLOAT32' }, 
            { id: "dataMask", bands: 1 }
        ]
    };
}

// 1. FUNCIÓN MATEMÁTICA BÁSICA
function calcIndex(b1, b2) {
    // Protegemos el denominador para que nunca sea exactamente 0
    let denominador = b1 + b2;
    if (denominador === 0) denominador = 0.00001; 
    return (b1 - b2) / denominador;
}

// 2. LA MÁSCARA DE AGUA (SWBM REFACCIONADO)
function getWaterMask(p) {
    let isCloud = false;
    let isWater = 0;
    
    // Filtro de nubes SCL de Sentinel-2
    if ([8, 9].includes(p.SCL)) {
        isCloud = true;
    }

    // Si no es nube, calculamos índices de agua
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

// 3. Valores típicos de Clorofila-a según el modelo para colorear
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
    // Obtenemos la máscara de este píxel
    let mascara = getWaterMask(p);
    
    // Preparamos el color natural para la tierra (multiplicado por 2.5 para dar brillo)
    let colorTierra = [p.B04 * 2.5, p.B03 * 2.5, p.B02 * 2.5, p.dataMask];
    
    // Variables de salida
    let outColor = colorTierra;
    let NDCI = NaN;
    let indexVal = NaN; // Por defecto es NaN (NoData) si no es agua

    // Si el algoritmo de máscara dice que es agua:
    if (mascara.agua === 1) {
        // Calculamos el NDCI
        NDCI = calcIndex(p.B05, p.B04);
        
        // Calculamos Chl-a con Mishra
        indexVal = 14.039 + 86.115 * NDCI + 194.325 * Math.pow(NDCI, 2);

        // APLICAMOS COLORBLEND CON LOS NUEVOS LÍMITES
        let colorChla = colorBlend(indexVal, chlaStops, chlaColors);
        
        colorChla.push(p.dataMask);
        outColor = colorChla;
    }

    return {
        default: outColor,
        index: [indexVal],
        eobrowserStats: [indexVal, mascara.nube], 
        dataMask: [p.dataMask]
    };
}
