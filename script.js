const csvUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vT8ovJJRjyH72GlgMo5GawzsSWRSNd0Fq_FDAvdTcia8Vh3bo9HKzQSA9-R6jGdiEiDuyQjQNZM-SnF/pub?output=csv";
let rawData = [];
let yearsSet = new Set();
let allData = [];
let markersGroup;
let map;
let monthChartInstance = null;
let eventTypeChartInstance = null;

// Gestió dels desplegables
document.querySelectorAll('.toggle-title').forEach(el => {
    el.addEventListener('click', function() {
        const box = this.parentElement;
        const content = this.nextElementSibling;
        const isOpen = box.classList.contains('open');

        // Tancar altres desplegables oberts
        if (!isOpen) {
            document.querySelectorAll('.toggle-box.open').forEach(openBox => {
                if (openBox !== box) {
                    openBox.classList.remove('open');
                    openBox.querySelector('.toggle-content').style.display = 'none';
                    const openIcon = openBox.querySelector('.toggle-icon .fa-minus');
                    if (openIcon) openIcon.classList.replace('fa-minus', 'fa-plus');
                }
            });
        }
        
        // Mostrar/amagar el contingut actual
        content.style.display = isOpen ? 'none' : 'block';
        box.classList.toggle('open');
        
        // Canviar icona
        const icon = this.querySelector('.toggle-icon i');
        if (box.classList.contains('open')) {
            icon.classList.replace('fa-plus', 'fa-minus');
        } else {
            icon.classList.replace('fa-minus', 'fa-plus');
        }

        // Ajustar mapa si s'obre el seu contenidor
        if (box.querySelector('#map') && !isOpen) {
            setTimeout(() => { if (map) map.invalidateSize(); }, 10);
        }
    });
});

// Actualitzar estadístiques
let stats = { totalEvents: 0, totalMunicipalities: 0, totalPromotors: 0 };
function updateStats() {
    document.getElementById('total-events').textContent = stats.totalEvents;
    document.getElementById('total-municipalities').textContent = stats.totalMunicipalities;
    document.getElementById('total-promotors').textContent = stats.totalPromotors;
}

// Funció per normalitzar noms de municipis
function normalizeMunicipalityName(name) {
    if (!name) return "";
    // Convertir a minúscules, treure accents i espais extra
    return name.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Treure accents
        .replace(/\s+/g, ' ') // Reemplaçar múltiples espais per un sol
        .trim();
}

// Funció per processar entitats promotores
function getUniqueEntities(entitiesString) {
    if (!entitiesString) return new Set();
    // Dividir per comes i eliminar espais en blanc
    const entities = entitiesString.split(',').map(e => e.trim()).filter(e => e);
    return new Set(entities);
}

// Inicialitzar mapa
function initMap(){
    map = L.map('map').setView([40.95, 0.65], 9);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO'
    }).addTo(map);
    markersGroup = L.layerGroup().addTo(map);

    // Carregar dades CSV
    Papa.parse(csvUrl, {
        download: true, 
        header: true,
        complete: function(results) {
            allData = results.data.filter(row => row["Nom"] && row["Nom"].trim() !== "");
            stats.totalEvents = allData.length;
            
            const uniqueMunicipalities = new Set();
            const uniquePromotors = new Set(); // Ara per entitats promotores
            const uniquePresidents = new Set(); // Per al filtre de presidents
            
            allData.forEach(row => {
                if (row["Localització"]?.trim()) {
                    // Usar el nom normalitzat per evitar duplicats
                    const normalizedName = normalizeMunicipalityName(row["Localització"]);
                    uniqueMunicipalities.add(normalizedName);
                }
                
                // Processar entitats promotores
                if (row["Nom entitat promotora"]?.trim()) {
                    const entities = getUniqueEntities(row["Nom entitat promotora"]);
                    entities.forEach(ent => uniquePromotors.add(ent));
                }
                
                // Processar presidents per al filtre
                if (row["Presidents"]?.trim()) uniquePresidents.add(row["Presidents"].trim());
            });
            
            stats.totalMunicipalities = uniqueMunicipalities.size;
            stats.totalPromotors = uniquePromotors.size;
            updateStats();

            // Omplir select de presidents
            const select = document.getElementById('promotorSelect');
            uniquePresidents.forEach(promotor => {
                const option = document.createElement("option");
                option.value = promotor;
                option.text = promotor;
                select.appendChild(option);
            });

            // Dibuixar marcadors inicials
            drawMarkers("Tots");
            
            // Event de canvi en el select
            select.addEventListener("change", () => drawMarkers(select.value));
        }
    });
}

// Dibuixar marcadors al mapa
function drawMarkers(promotorFilter) {
    markersGroup.clearLayers();
    const municipis = {};

    allData.forEach(row => {
        if(row.Latitud && row.Longitud) {
            const nomOriginal = row["Localització"]?.trim();
            if (!nomOriginal) return;

            const promotor = row["Presidents"] ? row["Presidents"].trim() : "";

            if (promotorFilter === "Tots" || promotor === promotorFilter) {
                const lat = parseFloat(row.Latitud.replace(",", "."));
                const lon = parseFloat(row.Longitud.replace(",", "."));
                if (!isNaN(lat) && !isNaN(lon)) {
                    // Usar el nom normalitzat per agrupar correctament
                    const normalizedName = normalizeMunicipalityName(nomOriginal);
                    
                    if (!municipis[normalizedName]) {
                        municipis[normalizedName] = { 
                            lat, 
                            lon, 
                            count: 0,
                            name: nomOriginal  // Guardar el nom original per mostrar
                        };
                    }
                    municipis[normalizedName].count++;
                }
            }
        }
    });

    // Afegir marcadors al mapa amb mida fixa
    Object.entries(municipis).forEach(([normalizedName, m]) => {
        L.circleMarker([m.lat, m.lon], {
            radius: 6, // Mida fixa per a totes les esferes
            fillColor: "#9F3222", 
            color: "#fff",
            weight: 2, 
            opacity: 1, 
            fillOpacity: 0.8
        }).addTo(markersGroup)
            .bindPopup(`<div class="popup-grid"><div class="popup-title">${m.name}</div><div class="popup-icon"><i class="fas fa-calendar-alt"></i></div><div class="popup-text"><span class="popup-label">Esdeveniments</span><span class="popup-value">${m.count}</span></div></div>`);
    });
}

// Obtenir dades per a gràfics
async function fetchData(){
    const response = await fetch(csvUrl);
    const text = await response.text();
    const p_results = Papa.parse(text, { header: true });
    rawData = p_results.data
        .filter(d => /^\d{4}$/.test(d['Any inici']) && /^\d{1,2}$/.test(d['Mes inici']))
        .map(d => ({
            any: d['Any inici'], 
            mes: d['Mes inici'],
            tipus: d['Tipus d\'esdeveniment'] || 'Sense especificar'
        }));
    rawData.forEach(d => yearsSet.add(d.any));
}

// Crear gràfic de barres per any
function drawYearChart(){
    const counts = {};
    rawData.forEach(d => { counts[d.any] = (counts[d.any] || 0) + 1; });
    const years = Array.from(yearsSet).sort();
    const values = years.map(y => counts[y] || 0);

    new Chart(document.getElementById('yearChart'), {
        type:'bar', 
        data:{ 
            labels:years, 
            datasets:[{ 
                label:"Esdeveniments", 
                data:values, 
                backgroundColor:'rgba(159, 50, 34, 0.8)', 
                borderColor:'rgba(159, 50, 34, 1)', 
                borderWidth:1, 
                borderRadius:4 
            }] 
        },
        options:{ 
            responsive:true, 
            maintainAspectRatio: true, 
            scales:{ 
                y:{ 
                    beginAtZero:true, 
                    ticks:{ 
                        stepSize:1, 
                        color:'#9F3222' 
                    } 
                }, 
                x:{ 
                    ticks:{ 
                        color:'#9F3222' 
                    } 
                } 
            } 
        }
    });
}

// Omplir select d'anys per a tots els gràfics
function fillYearSelects(){
    const years = Array.from(yearsSet).sort();
    
    // Omplir selector per a gràfic mensual
    const monthSelect = document.getElementById('yearSelect');
    years.forEach(y => {
        const opt = document.createElement('option');
        opt.value = y; opt.textContent = y;
        monthSelect.appendChild(opt);
    });
    
    // Omplir selector per a gràfic de tipus
    const eventTypeSelect = document.getElementById('eventTypeYearSelect');
    years.forEach(y => {
        const opt = document.createElement('option');
        opt.value = y; opt.textContent = y;
        eventTypeSelect.appendChild(opt);
    });
}

// Crear gràfic de línies per mes
function drawMonthChart(selectedYear='all'){
    const mesosNom = ['Gen','Febr','Març','Abr','Maig','Juny','Jul','Ago','Set','Oct','Nov','Des'];
    const filt = selectedYear === 'all' ? rawData : rawData.filter(d => d.any === selectedYear);
    const counts = new Array(12).fill(0);
    filt.forEach(d => { counts[parseInt(d.mes, 10) - 1]++; });
    
    if(monthChartInstance) monthChartInstance.destroy();
    
    monthChartInstance = new Chart(document.getElementById('monthChart'), {
        type:'line', 
        data:{ 
            labels:mesosNom, 
            datasets:[{ 
                label: selectedYear==='all'?'Tots els anys':`Any ${selectedYear}`, 
                data:counts, 
                borderColor:'rgba(159, 50, 34, 0.9)', 
                backgroundColor: 'rgba(159, 50, 34, 0.1)', 
                borderWidth: 3, 
                pointBackgroundColor: '#9F3222', 
                pointRadius: 5, 
                fill: true, 
                tension: 0.3 
            }] 
        },
        options:{ 
            responsive:true, 
            maintainAspectRatio: true, 
            scales: { 
                y: { 
                    ticks: { 
                        color: '#9F3222' 
                    } 
                }, 
                x: { 
                    ticks: { 
                        color: '#9F3222' 
                    } 
                } 
            } 
        }
    });
}

// Funció per crear el gràfic de tipus d'esdeveniments
function drawEventTypeChart(selectedYear='all') {
    // Filtrar dades segons l'any seleccionat
    const filteredData = selectedYear === 'all' 
        ? rawData 
        : rawData.filter(d => d.any === selectedYear);
    
    // Comptar la freqüència de cada tipus d'esdeveniment
    const typeCounts = {};
    filteredData.forEach(event => {
        // Normalitzar el tipus d'esdeveniment per agrupar millor
        const eventType = event.tipus.trim() || 'Sense especificar';
        typeCounts[eventType] = (typeCounts[eventType] || 0) + 1;
    });
    
    // Ordenar els tipus per freqüència descendent
    const sortedTypes = Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10); // Mostrar només els 10 principals
    
    // Extreure etiquetes i valors
    const labels = sortedTypes.map(item => item[0]);
    const values = sortedTypes.map(item => item[1]);
    
    // Destruir gràfic anterior si existeix
    if (eventTypeChartInstance) {
        eventTypeChartInstance.destroy();
    }
    
    // Crear nou gràfic
    const ctx = document.getElementById('eventTypeChart').getContext('2d');
    eventTypeChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: `Nombre d'esdeveniments`,
                data: values,
                backgroundColor: [
                    'rgba(159, 50, 34, 0.8)',
                    'rgba(180, 70, 50, 0.8)',
                    'rgba(200, 90, 70, 0.8)',
                    'rgba(220, 110, 90, 0.8)',
                    'rgba(240, 130, 110, 0.8)',
                    'rgba(255, 150, 130, 0.8)',
                    'rgba(255, 170, 150, 0.8)',
                    'rgba(255, 190, 170, 0.8)',
                    'rgba(255, 210, 190, 0.8)',
                    'rgba(255, 230, 210, 0.8)'
                ],
                borderColor: [
                    'rgba(159, 50, 34, 1)',
                    'rgba(180, 70, 50, 1)',
                    'rgba(200, 90, 70, 1)',
                    'rgba(220, 110, 90, 1)',
                    'rgba(240, 130, 110, 1)',
                    'rgba(255, 150, 130, 1)',
                    'rgba(255, 170, 150, 1)',
                    'rgba(255, 190, 170, 1)',
                    'rgba(255, 210, 190, 1)',
                    'rgba(255, 230, 210, 1)'
                ],
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y', // Barres horitzontals
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                },
                title: {
                    display: true,
                    text: `Tipus d'esdeveniments ${selectedYear === 'all' ? '(tots els anys)' : `(${selectedYear})`}`
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#9F3222'
                    },
                    beginAtZero: true
                },
                y: {
                    ticks: {
                        color: '#9F3222'
                    }
                }
            }
        }
    });
}

// Event per canviar any en gràfic mensual
document.getElementById('yearSelect').addEventListener('change', (e) => drawMonthChart(e.target.value));

// Event per canviar any en gràfic de tipus
document.getElementById('eventTypeYearSelect').addEventListener('change', (e) => drawEventTypeChart(e.target.value));

// Inicialitzar l'aplicació
async function init(){
    initMap();
    await fetchData();
    fillYearSelects();
    drawYearChart();
    drawMonthChart();
    drawEventTypeChart(); // Dibuixar el nou gràfic
}

document.addEventListener('DOMContentLoaded', init);