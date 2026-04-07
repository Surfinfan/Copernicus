//VERSION=3
/*
Chl-a (Modelo Lineal NDI) con Máscara de Agua SWBM
- Máscara de Agua: SWBM (Mohor Gartner)
- Índice: NDI = (B05 - B04) / (B05 + B04)
- Chl-a: 117.51 * NDI + 7.47
*/

// UMBRALES DEL SWBM
const MNDWI_thr = 0.1;
const NDWI_thr = 0.2;
const SWI_thr = 0.03;

function setup() {
    return {
        // Entradas: B06 eliminada por no ser necesaria aquí
        input: ["B02", "B03", "B04", "B05", "B08", "B11", "SCL", "dataMask"],
        output: [
            { id: "default", bands: 4 }, 
            { id: "index", bands: 1, sampleType: 'FLOAT32' },
            { id: "eobrowserStats", bands: 2, sampleType: 'FLOAT32' }, 
            { id: "dataMask", bands: 1 }
        ]
    };
}

// 1. FUNCIÓN MATEMÁTICA PARA MÁSCARA Y NDI (Con protección div/0)
function calcIndex(b1, b2) {
    let denominador = b1 + b2;
    if (denominador === 0) denominador = 0.00001; 
    return (b1 - b2) / denominador;
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

// 3. PALETA UNIFICADA DE CHL-A PARA TODOS LOS MODELOS (0 a 500+ µg/L)
const chlaStops = [0, 15, 30, 50, 100, 250, 500]; 
const chlaColors = [
    [0.0, 0.0, 0.5], // 0: Azul oscuro (Agua clara / Oligotrófica)
    [0.2, 0.6, 1.0], // 15: Azul claro
    [0.0, 0.8, 0.4], // 30: Verde (Inicio de floración algal)
    [0.8, 1.0, 0.0], // 50: Amarillo verdoso
    [1.0, 0.6, 0.0], // 100: Naranja (Estado Eutrófico)
    [1.0, 0.0, 0.0], // 250: Rojo (Estado Hipertrófico)
    [0.6, 0.0, 0.8]  // 500: Morado (Bloom extremo / "Sopa verde")
];

// 4. FUNCIÓN PRINCIPAL
function evaluatePixel(p) {
    let mascara = getWaterMask(p);
    
    // Color natural para tierra
    let colorTierra = [p.B04 * 2.5, p.B03 * 2.5, p.B02 * 2.5, p.dataMask];
    
    let outColor = colorTierra;
    let indexVal = NaN; // NoData por defecto

    // Si es agua, calculamos el modelo lineal NDI
    if (mascara.agua === 1) {
        
        // ECUACIÓN 2: Cálculo del NDI usando las bandas B05 (R705) y B04 (R665)
        // Es el mismo indice que Mishra (NDCI)
        let ndi = calcIndex(p.B05, p.B04);
        
        // ECUACIÓN 1: Regresión lineal para obtener Chl-a (µg/L)
        // Sustituimos las comas europeas por puntos decimales en JavaScript
        indexVal = 117.51 * ndi + 7.47;
        
        // Transformamos el valor de µg/L a un color en el mapa
        let colorCHLA = colorBlend(indexVal, chlaStops, chlaColors);
        colorCHLA.push(p.dataMask);
        outColor = colorCHLA;
    }

    return {
        default: outColor,
        index: [indexVal], // Valor puro para la herramienta estadística
        eobrowserStats: [indexVal, mascara.nube],
        dataMask: [p.dataMask]
    };
}