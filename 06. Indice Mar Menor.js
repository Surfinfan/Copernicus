//VERSION=3
/*
Chl-a (Zhan et al. 2022 - Modelo Mar Menor para Sentinel-2)
- Máscara de Agua: SWBM (Mohor Gartner)
- Estructura: (R560 + R705) / (R560 + R665)
- Ecuación Lineal: Chla = 124.94 * X - 115.35
*/

const MNDWI_thr = 0.1;
const NDWI_thr = 0.2;
const SWI_thr = 0.03;

function setup() {
    return {
        // Necesitamos B03 (560nm), B04 (665nm) y B05 (705nm) para la fórmula
        input: ["B02", "B03", "B04", "B05", "B08", "B11", "SCL", "dataMask"],
        output: [
            { id: "default", bands: 4 }, 
            { id: "index", bands: 1, sampleType: 'FLOAT32' },
            { id: "eobrowserStats", bands: 2, sampleType: 'FLOAT32' }, 
            { id: "dataMask", bands: 1 }
        ]
    };
}

function calcWaterIndex(b1, b2) {
    let denominador = b1 + b2;
    if (denominador === 0) denominador = 0.00001; 
    return (b1 - b2) / denominador;
}

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

// PALETA UNIFICADA (0 a 500+ µg/L)
const chlaStops = [0, 15, 30, 50, 100, 250, 500]; 
const chlaColors = [
    [0.0, 0.0, 0.5], 
    [0.2, 0.6, 1.0], 
    [0.0, 0.8, 0.4], 
    [0.8, 1.0, 0.0], 
    [1.0, 0.6, 0.0], 
    [1.0, 0.0, 0.0], 
    [0.6, 0.0, 0.8]  
];

function evaluatePixel(p) {
    let mascara = getWaterMask(p);
    let colorTierra = [p.B04 * 2.5, p.B03 * 2.5, p.B02 * 2.5, p.dataMask];
    
    let outColor = colorTierra;
    let indexVal = NaN; 

    if (mascara.agua === 1) {
        
        // 1. Identificamos las bandas necesarias
        let r560 = p.B03;
        let r665 = p.B04;
        let r705 = p.B05;

        // 2. Calculamos el índice base del modelo (X)
        // Protegemos el denominador para evitar errores matemáticos
        let denominador = r560 + r665;
        if (denominador === 0) denominador = 0.00001;
        
        let X = (r560 + r705) / denominador;
        
        // 3. Aplicamos la regresión lineal calibrada para el Mar Menor [cite: 2331, 2474]
        indexVal = 124.94 * X - 115.35;

        // Filtro de seguridad: Evitar valores negativos
        if (indexVal < 0) {
            indexVal = 0;
        }

        let colorCHLA = colorBlend(indexVal, chlaStops, chlaColors);
        colorCHLA.push(p.dataMask);
        outColor = colorCHLA;
    }

    return {
        default: outColor,
        index: [indexVal], 
        eobrowserStats: [indexVal, mascara.nube],
        dataMask: [p.dataMask]
    };
}