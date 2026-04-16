//VERSION=3
/*
Chl-a (Sòria-Perpinyà et al., 2021 - Sentinel-2)
- Máscara de Agua: SWBM (Mohor Gartner)
- Algoritmo por tramos (Piecewise):
  * Alta Chl-a (> 5): 19.866 * (R705/R665)^2.3051
  * Baja Chl-a (< 5): 10^(-2.4792 * log10(max(R443, R492)/R560) - 0.0389)
*/

const MNDWI_thr = 0.1;
const NDWI_thr = 0.2;
const SWI_thr = 0.03;

function setup() {
    return {
        // Añadida B01 (R443) necesaria para el tramo de baja concentración
        input: ["B01", "B02", "B03", "B04", "B05", "B08", "B11", "SCL", "dataMask"],
        output: [
            { id: "default", bands: 4 }, 
            { id: "index", bands: 1, sampleType: 'FLOAT32' },
            { id: "eobrowserStats", bands: 2, sampleType: 'FLOAT32' }, 
            { id: "dataMask", bands: 1 }
        ]
    };
}

// Función auxiliar para índices de agua
function calcIndex(b1, b2) {
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
        let mndwi = calcIndex(p.B03, p.B11);
        let ndwi = calcIndex(p.B03, p.B08);
        let swi = calcIndex(p.B05, p.B11);

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
        
        // 1. Asignamos las bandas a longitudes de onda (con protección contra división por cero)
        let r443 = p.B01;
        let r492 = p.B02;
        let r560 = Math.max(p.B03, 0.0001); // B03
        let r665 = Math.max(p.B04, 0.0001); // B04
        let r705 = p.B05;                   // B05

        // 2. Calculamos el ratio de conmutación (Switch Ratio) según los autores
        let ratio_switch = r705 / r665;
        
        // 3. Aplicamos el modelo por tramos
        if (ratio_switch > 0.8) {
            // ECUACIÓN PARA ALTA CONCENTRACIÓN (> 5 µg/L)
            indexVal = 19.866 * Math.pow(ratio_switch, 2.3051);
        } else {
            // ECUACIÓN PARA BAJA CONCENTRACIÓN (< 5 µg/L)
            let max_blue = Math.max(r443, r492);
            let ratio_low = max_blue / r560;
            
            // Proteger el logaritmo base 10 contra valores <= 0
            if (ratio_low > 0) {
                let log10_ratio = Math.log10(ratio_low);
                let exponente = -2.4792 * log10_ratio - 0.0389;
                indexVal = Math.pow(10, exponente); // exp.10 en la fórmula significa 10^x
            } else {
                indexVal = 0;
            }
        }

        // Filtro de seguridad general
        if (indexVal < 0) {
            indexVal = 0;
        }

        // 4. Transformar valor matemático a color en el mapa
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