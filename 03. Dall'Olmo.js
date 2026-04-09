//VERSION=3
/*
Chl-a (Dall'Olmo et al. 2003 - Adaptado a Sentinel-2)
- Máscara de Agua: SWBM (Mohor Gartner)
- Modelo de 3 Bandas: X = (1/R665 - 1/R705) * R740
- Ecuación Polinómica: Chla = -28.3(X^2) + 161.0(X) + 56.7
*/

const MNDWI_thr = 0.1;
const NDWI_thr = 0.2;
const SWI_thr = 0.03;

function setup() {
    return {
        // Necesitamos B04, B05 y B06 para la fórmula
        input: ["B02", "B03", "B04", "B05", "B06", "B08", "B11", "SCL", "dataMask"],
        output: [
            { id: "default", bands: 4 }, 
            { id: "index", bands: 1, sampleType: 'FLOAT32' },
            { id: "eobrowserStats", bands: 2, sampleType: 'FLOAT32' }, 
            { id: "dataMask", bands: 1 }
        ]
    };
}

function calcIndex(b1, b2) {
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
        let mndwi = calcIndex(p.B03, p.B11);
        let ndwi = calcIndex(p.B03, p.B08);
        let swi = calcIndex(p.B05, p.B11);

        if (mndwi > MNDWI_thr || ndwi > NDWI_thr || swi > SWI_thr) {
            isWater = 1;
        }
    }

    return { agua: isWater, nube: isCloud ? 1 : 0 };
}

// PALETA UNIFICADA
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
        
        // 1. Asignamos las bandas adaptadas a S2 y protegemos contra división por cero
        let r1 = Math.max(p.B04, 0.0001); // B04 (~665 nm)
        let r2 = Math.max(p.B05, 0.0001); // B05 (~705 nm)
        let r3 = p.B06;                   // B06 (~740 nm)

        // 2. Calculamos el índice X del modelo de 3 bandas
        let X = ((1 / r1) - (1 / r2)) * r3;
        
        // 3. Aplicamos la ecuación polinómica de Dall'Olmo (2003)
        indexVal = -28.3 * Math.pow(X, 2) + 161.0 * X + 56.7;

        // Filtro de seguridad: Evitar valores negativos irreales por efecto del polinomio
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