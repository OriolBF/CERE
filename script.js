const csvUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQaVGkMjzD_21PrjnGZHvtWvkPLi0C3QcemJmdZHqGgWLkqqh10K3EfSrz_h9fTRfc0fZMF4EFhMzfb/pub?output=csv";
let rawData = [];
let yearsSet = new Set();
let allData = [];
let markersGroup;
let map;
let monthChartInstance = null;
let eventTypeChartInstance = null;

const eventCategories = [
    { min: 1, max: 5, color: "rgba(247, 170, 170, 1)", label: "1-5 esdeveniments" },
    { min: 6, max: 10, color: "rgba(255, 145, 145, 0.8)", label: "6-10 esdeveniments" },
    { min: 11, max: 25, color: "rgba(253, 88, 88, 0.9)", label: "11-25 esdeveniments" },
    { min: 26, max: 50, color: "rgba(252, 52, 52, 0.95)", label: "26-50 esdeveniments" },
    { min: 51, max: Infinity, color: "rgba(153, 35, 16, 1)", label: "+ 50 esdeveniments" }
];

function getEventCategory(count) {
    return eventCategories.find(category => count >= category.min && count <= category.max) || eventCategories[0];
}

function updateLegend() {
    const existingLegend = document.querySelector('.map-legend');
    if (existingLegend) {
        existingLegend.remove();
    }
    
    const legend = L.control({position: 'bottomright'});
    
    legend.onAdd = function (map) {
        const div = L.DomUtil.create('div', 'map-legend');
        div.innerHTML = '<h4>Esdeveniments per municipi</h4>';
        
        eventCategories.forEach(category => {
            div.innerHTML += `
                <div class="legend-item">
                    <span class="legend-color" style="background:${category.color}"></span>
                    <span>${category.label}</span>
                </div>
            `;
        });
        
        return div;
    };
    
    legend.addTo(map);
}

document.querySelectorAll('.toggle-title').forEach(el => {
    el.addEventListener('click', function() {
        const box = this.parentElement;
        const content = this.nextElementSibling;
        const isOpen = box.classList.contains('open');

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
        
        content.style.display = isOpen ? 'none' : 'block';
        box.classList.toggle('open');
        
        const icon = this.querySelector('.toggle-icon i');
        if (box.classList.contains('open')) {
            icon.classList.replace('fa-plus', 'fa-minus');
        } else {
            icon.classList.replace('fa-minus', 'fa-plus');
        }

        if (box.querySelector('#map') && !isOpen) {
            setTimeout(() => { if (map) map.invalidateSize(); }, 10);
        }
    });
});

let stats = { totalEvents: 0, totalMunicipalities: 0, totalPromotors: 0 };
function updateStats() {
    document.getElementById('total-events').textContent = stats.totalEvents;
    document.getElementById('total-municipalities').textContent = stats.totalMunicipalities;
    document.getElementById('total-promotors').textContent = stats.totalPromotors;
}

function normalizeMunicipalityName(name) {
    if (!name) return "";
    return name.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, ' ')
        .trim();
}

function getUniqueEntities(entitiesString) {
    if (!entitiesString) return new Set();
    const entities = entitiesString.split(',').map(e => e.trim()).filter(e => e);
    return new Set(entities);
}

function initMap(){
    map = L.map('map').setView([40.95, 0.65], 9);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO'
    }).addTo(map);
    markersGroup = L.layerGroup().addTo(map);

    // Dins de la funció initMap(), a la part del Papa.parse complete:
Papa.parse(csvUrl, {
    download: true, 
    header: true,
    complete: function(results) {
        // Filtrar només esdeveniments (excloure activitats orgàniques)
        allData = results.data.filter(row => 
            row["Nom"] && row["Nom"].trim() !== "" && row["Tipus"] === "Esdeveniments"
        );
        
        stats.totalEvents = allData.length;
        
        const uniqueMunicipalities = new Set();
        const uniquePromotors = new Set(); 
        const presidentPeriodMap = new Map();
        
        allData.forEach(row => {
            if (row["Localització"]?.trim()) {
                const normalizedName = normalizeMunicipalityName(row["Localització"]);
                uniqueMunicipalities.add(normalizedName);
            }
            
            if (row["Nom entitat promotora"]?.trim()) {
                const entities = getUniqueEntities(row["Nom entitat promotora"]);
                entities.forEach(ent => uniquePromotors.add(ent));
            }
            
            // Processar presidents amb període
            if (row["Presidents"]?.trim() && row["Període"]?.trim()) {
                const president = row["Presidents"].trim();
                const period = row["Període"].trim();
                const key = `${president}|${period}`;
                
                if (!presidentPeriodMap.has(key)) {
                    presidentPeriodMap.set(key, {
                        president: president,
                        period: period
                    });
                }
            }
        });
        
        stats.totalMunicipalities = uniqueMunicipalities.size;
        stats.totalPromotors = uniquePromotors.size;
        updateStats();

        const select = document.getElementById('promotorSelect');
        
        // Netejar select previ per evitar duplicats
        select.innerHTML = '';
        
        // Afegir opció "Tots" (només una vegada)
        const allOption = document.createElement("option");
        allOption.value = "Tots";
        allOption.text = "Tots els presidents";
        select.appendChild(allOption);
        
        // Afegir opcions per a cada combinació president-període
        presidentPeriodMap.forEach((value, key) => {
            const option = document.createElement("option");
            option.value = key;
            option.text = `${value.president} ${value.period}`;
            select.appendChild(option);
        });

        drawMarkers("Tots");
        
        select.addEventListener("change", () => drawMarkers(select.value));
    }
});
}

function drawMarkers(presidentPeriodFilter) {
    markersGroup.clearLayers();
    const municipis = {};

    allData.forEach(row => {
        if(row.Latitud && row.Longitud) {
            const nomOriginal = row["Localització"]?.trim();
            if (!nomOriginal) return;

            const president = row["Presidents"] ? row["Presidents"].trim() : "";
            const period = row["Període"] ? row["Període"].trim() : "";
            const currentKey = president && period ? `${president}|${period}` : "";
            
            // Filtrar per president i període
            if (presidentPeriodFilter === "Tots" || currentKey === presidentPeriodFilter) {
                const lat = parseFloat(row.Latitud.replace(",", "."));
                const lon = parseFloat(row.Longitud.replace(",", "."));
                if (!isNaN(lat) && !isNaN(lon)) {
                    const normalizedName = normalizeMunicipalityName(nomOriginal);
                    
                    if (!municipis[normalizedName]) {
                        municipis[normalizedName] = { 
                            lat, 
                            lon, 
                            count: 0,
                            name: nomOriginal 
                        };
                    }
                    municipis[normalizedName].count++;
                }
            }
        }
    });

    Object.entries(municipis).forEach(([normalizedName, m]) => {
        const category = getEventCategory(m.count);
        
        L.circleMarker([m.lat, m.lon], {
            radius: 6,
            fillColor: category.color,
            color: "#fff",
            weight: 2, 
            opacity: 1, 
            fillOpacity: 0.8
        }).addTo(markersGroup)
            .bindPopup(`<div class="popup-grid"><div class="popup-title">${m.name}</div><div class="popup-icon"><i class="fas fa-calendar-alt"></i></div><div class="popup-text"><span class="popup-label">Esdeveniments</span><span class="popup-value">${m.count}</span></div><div class="popup-category">${category.label}</div></div>`);
    });
    
    updateLegend();
}

async function fetchData(){
    const response = await fetch(csvUrl);
    const text = await response.text();
    const p_results = Papa.parse(text, { header: true });
    
    // Filtrar només esdeveniments (excloure activitats orgàniques)
    rawData = p_results.data
        .filter(d => 
            /^\d{4}$/.test(d['Any inici']) && 
            /^\d{1,2}$/.test(d['Mes inici']) && 
            d['Tipus'] === 'Esdeveniments'
        )
        .map(d => ({
            any: d['Any inici'], 
            mes: d['Mes inici'],
            tipus: d['Tipus d\'esdeveniment'] || 'Sense especificar',
            cere: d['CERE'] ? d['CERE'].trim() : ''  
        }));
        
    rawData.forEach(d => yearsSet.add(d.any));
}

function drawYearChart(){
    const counts = {};  
    rawData.forEach(d => {
        if (!counts[d.any]) {
            counts[d.any] = { total: 0, impulsor: 0, colaborador: 0 };
        }
        counts[d.any].total++;

        if (d.cere.toLowerCase().includes("impulsor")) {
            counts[d.any].impulsor++;
        } else if (d.cere.toLowerCase().includes("col·laborador") || d.cere.toLowerCase().includes("col.laborador")) {
            counts[d.any].colaborador++;
        }
    });

    const years = Array.from(yearsSet).sort();
    const impulsors = years.map(y => counts[y] ? counts[y].impulsor : 0);
    const colaboradors = years.map(y => counts[y] ? counts[y].colaborador : 0);

    new Chart(document.getElementById('yearChart'), {
            type: 'bar',
            data: {
                labels: years,
                datasets: [
                    {
                        label: "Impulsor",
                        data: impulsors,
                        backgroundColor: 'rgba(159, 50, 34, 0.8)',
                        borderColor: 'rgba(159, 50, 34, 1)',
                        borderWidth: 1,
                        borderRadius: 4
                    },
                    {
                        label: "Col·laborador",
                        data: colaboradors,
                        backgroundColor: 'rgba(220, 110, 90, 0.8)',
                        borderColor: 'rgba(220, 110, 90, 1)',
                        borderWidth: 1,
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    title: {
                        display: true,
                        text: "Esdeveniments per any on el CERE ha estat impulsor / col·laborador"
                    },
                    tooltip: {
                        callbacks: {
                            title: function(context) {
                                // Mostrar l'any al títol del tooltip
                                return `Any: ${context[0].label}`;
                            },
                            beforeBody: function(context) {
                                // Afegir el TOTAL abans de les dades de les barres
                                const year = context[0].label;
                                return `Total esdeveniments: ${counts[year].total}`;
                            },
                            label: function(context) {
                                // Informació normal de cada dataset
                                return `${context.dataset.label}: ${context.raw}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        stacked: true,
                        ticks: { stepSize: 1, color: '#9F3222' }
                    },
                    x: {
                        stacked: true,
                        ticks: { color: '#9F3222' }
                    }
                }
            }
        });
    }

function fillYearSelects(){
    const years = Array.from(yearsSet).sort();
    
    const yearSelect = document.getElementById('yearSelect');
    const eventTypeSelect = document.getElementById('eventTypeYearSelect');

    years.forEach(y => {
        if (y >= 2011) {
            const opt1 = document.createElement('option');
            opt1.value = y; 
            opt1.textContent = y;
            yearSelect.appendChild(opt1);

            const opt2 = document.createElement('option');
            opt2.value = y; 
            opt2.textContent = y;
            eventTypeSelect.appendChild(opt2);
        }
    });
}

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
                    ticks: { color: '#9F3222' } 
                }, 
                x: { 
                    ticks: { color: '#9F3222' } 
                } 
            } 
        }
    });
}

function drawEventTypeChart(selectedYear='all') {
    const filteredData = selectedYear === 'all' 
        ? rawData 
        : rawData.filter(d => d.any === selectedYear);
    
    const typeCounts = {};
    filteredData.forEach(event => {
        const eventType = event.tipus.trim() || 'Sense especificar';
        typeCounts[eventType] = (typeCounts[eventType] || 0) + 1;
    });
    
    const sortedTypes = Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    
    const labels = sortedTypes.map(item => item[0]);
    const values = sortedTypes.map(item => item[1]);
    
    if (eventTypeChartInstance) {
        eventTypeChartInstance.destroy();
    }
    
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
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false },
                title: {
                    display: true,
                    text: `Tipus d'esdeveniments ${selectedYear === 'all' ? '(tots els anys)' : `(${selectedYear})`}`
                }
            },
            scales: {
                x: { ticks: { color: '#9F3222' }, beginAtZero: true },
                y: { ticks: { color: '#9F3222' } }
            }
        }
    });
}

document.getElementById('yearSelect').addEventListener('change', (e) => drawMonthChart(e.target.value));
document.getElementById('eventTypeYearSelect').addEventListener('change', (e) => drawEventTypeChart(e.target.value));

async function init(){
    initMap();
    await fetchData();
    fillYearSelects();
    drawYearChart();
    drawMonthChart();
    drawEventTypeChart();
}

document.addEventListener('DOMContentLoaded', init);
