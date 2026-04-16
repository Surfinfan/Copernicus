//VERSION=3
/*
MCI-S2 (Maximum Chlorophyll Index adaptado a Sentinel-2)
- Basado en Gower et al. (2005) y el algoritmo UWQV
- Máscara de Agua: SWBM (Mohor Gartner)
- Cálculo: Altura del pico en B05 (705nm) sobre la línea base B04-B06
*/

const MNDWI_thr = 0.1;
const NDWI_thr = 0.2;
const SWI_thr = 0.03;

function setup() {
    return {
        input: ["B02", "B03", "B04", "B05", "B06", "B08", "B11", "SCL", "dataMask"],
        output: [
            { id: "default", bands: 4 }, 
            { id: "index", bands: 1, sampleType: 'FLOAT32' },
            { id: "eobrowserStats", bands: 2, sampleType: 'FLOAT32' }, 
            { id: "dataMask", bands: 1 }
        ]
    };
}

// Función auxiliar para índices de agua
function calcWaterIndex(b1, b2) {
    let denominador = b1 + b2;
    if (denominador === 0) denominador = 0.00001; 
    return (b1 - b2) / denominador;
}

// Máscara de agua SWBM
function getWaterMask(p) {
    let isCloud = false;
    let isWater = 0;
    
    if ([8, 9].includes(p.SCL)) {
        isCloud = true;
    }

    if (!isCloud) {
        let mndwi = calcWaterIndex(p.B03, p.B11);
        let ndwi = calcWaterIndex(p.B03, p.B08);
        let swi = calcWaterIndex(p.B05, p.B11);

        if (mndwi > MNDWI_thr || ndwi > NDWI_thr || swi > SWI_thr) {
            isWater = 1;
        }
    }
    return { agua: isWater, nube: isCloud ? 1 : 0 };
}

// PALETA UNIFICADA (Mismos colores, pero escala ajustada al rango del MCI)
// Rango típico del MCI: de -0.005 (aguas claras/tierra) a 0.05 (bloom extremo)
const mciStops = [-0.005, 0.000, 0.010, 0.020, 0.030, 0.040, 0.050]; 
const mciColors = [
    [0.0, 0.0, 0.5], // Azul oscuro (Poca señal MCI)
    [0.2, 0.6, 1.0], // Azul claro
    [0.0, 0.8, 0.4], // Verde
    [0.8, 1.0, 0.0], // Amarillo verdoso
    [1.0, 0.6, 0.0], // Naranja
    [1.0, 0.0, 0.0], // Rojo 
    [0.6, 0.0, 0.8]  // Morado (Bloom extremo, pico muy alto)
];

function evaluatePixel(p) {
    let mascara = getWaterMask(p);
    let colorTierra = [p.B04 * 2.5, p.B03 * 2.5, p.B02 * 2.5, p.dataMask];
    
    let outColor = colorTierra;
    let indexVal = NaN; 

    if (mascara.agua === 1) {
        
        // 1. Longitudes de onda de Sentinel-2 en nanómetros
        let wl_B04 = 665;
        let wl_B05 = 705;
        let wl_B06 = 740;

        // 2. Cálculo de las distancias geométricas (Pesos de la interpolación)
        // Peso de la banda izquierda (B04)
        let peso_B04 = (wl_B06 - wl_B05) / (wl_B06 - wl_B04); 
        
        // Peso de la banda derecha (B06)
        let peso_B06 = (wl_B05 - wl_B04) / (wl_B06 - wl_B04); 

        // 3. Algoritmo de Línea Base Lineal (MCI)
        // Altura del pico B05 restándole la línea base imaginaria entre B04 y B06
        indexVal = p.B05 - (peso_B04 * p.B04) - (peso_B06 * p.B06);

        // 4. Transformar el índice matemático a color en el mapa
        let colorMCI = colorBlend(indexVal, mciStops, mciColors);
        colorMCI.push(p.dataMask);
        outColor = colorMCI;
    }

    return {
        default: outColor,
        index: [indexVal], // En la gráfica estadística verás valores entre -0.01 y 0.05
        eobrowserStats: [indexVal, mascara.nube],
        dataMask: [p.dataMask]
    };
}