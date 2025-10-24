let parties = [];
let exclusions = [];
let inclusions = [];
let chart = null;

// Drag state
let dragState = {
    isDragging: false,
    dragParty: null,
    startX: 0,
    startY: 0,
    containerRect: null
};

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initialize();
    
    // Add event listeners
    document.getElementById('min-parties').addEventListener('change', updateCoalitions);
    document.getElementById('max-parties').addEventListener('change', updateCoalitions);
    
    // Add global mouse event listeners for drag functionality
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
});

async function initialize() {
    try {
        const response = await fetch('/api/initialize');
        const data = await response.json();
        
        if (data.success) {
            parties = data.parties;
            document.getElementById('total-seats').textContent = `Total seats: ${data.total_seats}`;
            
            populatePartyTable();
            populateDropdowns();
            initializeChart();
            updateCoalitions();
            
            document.getElementById('loading').style.display = 'none';
            document.getElementById('main-content').style.display = 'flex';
            
            // Add poll dropdown
            if (data.polls) {
                populatePollDropdown(data.polls, data.current_poll);
            }
            
            // Initialize spectrum after the content is visible and has proper dimensions
            setTimeout(initializeSpectrum, 100);
        } else {
            alert('Error: ' + data.error);
        }
    } catch (error) {
        alert('Failed to initialize: ' + error.message);
    }
}

async function changePoll() {
    const selectedPoll = document.getElementById('poll-dropdown').value;
    if (!selectedPoll) return;
    
    try {
        const response = await fetch('/api/change_poll', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ poll_name: selectedPoll })
        });
        
        const data = await response.json();
        if (data.success) {
            parties = data.parties;
            document.getElementById('total-seats').textContent = `Total seats: ${data.total_seats}`;
            populatePartyTable();
            populateDropdowns();
            
            // Recreate chart with new data
            recreateChart();
            
            updateCoalitions();
            updateSpectrum();
        }
    } catch (error) {
        alert('Failed to change poll: ' + error.message);
    }
}

function populatePollDropdown(polls, currentPoll) {
    const dropdown = document.getElementById('poll-dropdown');
    dropdown.innerHTML = polls.map(poll => 
        `<option value="${poll}" ${poll === currentPoll ? 'selected' : ''}>${poll}</option>`
    ).join('');
    document.getElementById('poll-selector').style.display = 'block';
}

function populatePartyTable() {
    const tbody = document.getElementById('party-tbody');
    tbody.innerHTML = '';
    
    parties.forEach((party, index) => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${party.name}</td>
            <td>${party.seats}</td>
            <td><input type="checkbox" class="party-checkbox" data-party="${party.name}" onchange="updateVisualization()"></td>
        `;
        row.onclick = function(e) {
            if (e.target.type !== 'checkbox') {
                const checkbox = row.querySelector('.party-checkbox');
                checkbox.checked = !checkbox.checked;
                updateVisualization();
            }
        };
    });
}

function populateDropdowns() {
    const partyOptions = parties.filter(p => p.seats > 0).map(p => `<option value="${p.name}">${p.name}</option>`).join('');
    
    document.getElementById('exclude-party1').innerHTML = '<option value="">Select party</option>' + partyOptions;
    document.getElementById('exclude-party2').innerHTML = '<option value="">Select party (optional)</option>' + partyOptions;
    document.getElementById('include-party1').innerHTML = '<option value="">Select party</option>' + partyOptions;
    document.getElementById('include-party2').innerHTML = '<option value="">Select party</option>' + partyOptions;
}

function getPartyColor(economicPosition) {
    // Convert economic position (-1 to 1) to color (green to yellow to red)
    // -1 = green, 0 = yellow, 1 = red
    const normalized = (economicPosition + 1) / 2; // Convert to 0-1 range
    
    let r, g, b;
    if (normalized < 0.5) {
        // Green to Yellow
        const ratio = normalized * 2;
        r = Math.round(255 * ratio);
        g = 255;
        b = 0;
    } else {
        // Yellow to Red
        const ratio = (normalized - 0.5) * 2;
        r = 255;
        g = Math.round(255 * (1 - ratio));
        b = 0;
    }
    
    return `rgb(${r}, ${g}, ${b})`;
}

function initializeChart() {
    const ctx = document.getElementById('seat-chart').getContext('2d');
    
    // Sort parties by seats (largest to smallest)
    const sortedParties = [...parties].sort((a, b) => b.seats - a.seats);
    
    const chartData = {
        labels: sortedParties.map(p => `${p.name} (${p.seats})`),
        datasets: [{
            data: sortedParties.map(p => p.seats),
            backgroundColor: sortedParties.map(p => getPartyColor(p.economic)),
            borderWidth: 2,
            borderColor: '#fff'
        }]
    };
    
    chart = new Chart(ctx, {
        type: 'bar',
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                title: {
                    display: true,
                    text: 'Seats by Party (colored by economic position: green=left, yellow=center, red=right)'
                }
            },
            scales: {
                x: {
                    ticks: {
                        autoSkip: false,
                        maxRotation: 45,
                        minRotation: 45
                    }
                },
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Seats'
                    }
                }
            }
        }
    });
}

function recreateChart() {
    // Destroy existing chart
    if (chart) {
        chart.destroy();
    }
    
    // Create new chart with updated data
    initializeChart();
}

function updateChart() {
    const selectedParties = Array.from(document.querySelectorAll('.party-checkbox:checked'))
        .map(cb => cb.dataset.party);
    
    // Sort parties by seats (largest to smallest)
    const sortedParties = [...parties].sort((a, b) => b.seats - a.seats);
    
    // Update chart colors - highlight selected parties
    chart.data.datasets[0].backgroundColor = sortedParties.map(p => {
        if (selectedParties.includes(p.name)) {
            // Keep the color but make it brighter/more saturated
            const baseColor = getPartyColor(p.economic);
            return baseColor.replace('rgb', 'rgba').replace(')', ', 1)');
        }
        // Make non-selected parties more transparent
        const baseColor = getPartyColor(p.economic);
        return baseColor.replace('rgb', 'rgba').replace(')', ', 0.4)');
    });
    
    // Update border for selected parties
    chart.data.datasets[0].borderColor = sortedParties.map(p => {
        if (selectedParties.includes(p.name)) {
            return '#000'; // Black border for selected
        }
        return '#fff';
    });
    
    chart.data.datasets[0].borderWidth = sortedParties.map(p => {
        if (selectedParties.includes(p.name)) {
            return 3; // Thicker border for selected
        }
        return 1;
    });
    
    chart.update();
}

function initializeSpectrum() {
    updateSpectrum();
}

function getPartyAbbreviation(partyName) {
    // Special cases for specific parties
    if (partyName === 'GL-PvdA') {
        return 'GL-PvdA';
    }
    
    // For parties with reasonable length, show full name if it fits
    if (partyName.length <= 7) {
        return partyName;
    }
    
    // For longer names with hyphens, try to abbreviate intelligently
    if (partyName.includes('-')) {
        const parts = partyName.split('-');
        if (parts.length === 2) {
            // Try to keep both parts if total length is reasonable
            if (partyName.length <= 8) {
                return partyName;
            }
            // Otherwise abbreviate second part
            return parts[0] + '-' + parts[1].substring(0, 2);
        }
    }
    
    // Default: first 5 characters for longer names
    return partyName.substring(0, 5);
}

function createSVGElements(containerWidth, containerHeight, padding) {
    const svg = document.getElementById('spectrum-svg');
    
    // Clear existing SVG content
    svg.innerHTML = '';
    
    // Update SVG viewBox to match container dimensions
    svg.setAttribute('viewBox', `0 0 ${containerWidth} ${containerHeight}`);
    
    // Create defs for grid pattern
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
    pattern.setAttribute('id', 'grid');
    pattern.setAttribute('width', '40');
    pattern.setAttribute('height', '40');
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M 40 0 L 0 0 0 40');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#e0e0e0');
    path.setAttribute('stroke-width', '1');
    
    pattern.appendChild(path);
    defs.appendChild(pattern);
    svg.appendChild(defs);
    
    // Grid background
    const gridRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    gridRect.setAttribute('width', '100%');
    gridRect.setAttribute('height', '100%');
    gridRect.setAttribute('fill', 'url(#grid)');
    svg.appendChild(gridRect);
    
    // Coalition lines group (behind everything else)
    const linesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    linesGroup.setAttribute('id', 'coalition-lines');
    svg.appendChild(linesGroup);
    
    // Calculate center and usable area
    const centerX = containerWidth / 2;
    const centerY = containerHeight / 2;
    const usableWidth = containerWidth - (padding * 2);
    const usableHeight = containerHeight - (padding * 2);
    
    // Axes
    const xAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    xAxis.setAttribute('x1', padding);
    xAxis.setAttribute('y1', centerY);
    xAxis.setAttribute('x2', containerWidth - padding);
    xAxis.setAttribute('y2', centerY);
    xAxis.setAttribute('stroke', '#666');
    xAxis.setAttribute('stroke-width', '2');
    svg.appendChild(xAxis);
    
    const yAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    yAxis.setAttribute('x1', centerX);
    yAxis.setAttribute('y1', padding);
    yAxis.setAttribute('x2', centerX);
    yAxis.setAttribute('y2', containerHeight - padding);
    yAxis.setAttribute('stroke', '#666');
    yAxis.setAttribute('stroke-width', '2');
    svg.appendChild(yAxis);
    
    // Axis labels
    const labels = [
        { x: padding + 20, y: 20, text: 'Progressive', anchor: 'start' },
        { x: containerWidth - padding - 20, y: 20, text: 'Progressive', anchor: 'end' },
        { x: padding + 20, y: containerHeight - 10, text: 'Conservative', anchor: 'start' },
        { x: containerWidth - padding - 20, y: containerHeight - 10, text: 'Conservative', anchor: 'end' },
        { x: 20, y: centerY + 5, text: 'Left', anchor: 'middle' },
        { x: containerWidth - 20, y: centerY + 5, text: 'Right', anchor: 'middle' }
    ];
    
    labels.forEach(label => {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', label.x);
        text.setAttribute('y', label.y);
        text.setAttribute('text-anchor', label.anchor);
        text.setAttribute('class', 'axis-label');
        text.textContent = label.text;
        svg.appendChild(text);
    });
    
    // Quadrant labels
    const quadrantLabels = [
        { x: padding + usableWidth * 0.25, y: padding + usableHeight * 0.25, text: 'Left-Progressive' },
        { x: padding + usableWidth * 0.75, y: padding + usableHeight * 0.25, text: 'Right-Progressive' },
        { x: padding + usableWidth * 0.25, y: padding + usableHeight * 0.75, text: 'Left-Conservative' },
        { x: padding + usableWidth * 0.75, y: padding + usableHeight * 0.75, text: 'Right-Conservative' }
    ];
    
    quadrantLabels.forEach(label => {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', label.x);
        text.setAttribute('y', label.y);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('class', 'quadrant-label');
        text.textContent = label.text;
        svg.appendChild(text);
    });
}

function updateSpectrum() {
    const container = document.querySelector('.spectrum-container');
    
    // Remove existing party elements
    container.querySelectorAll('.spectrum-party').forEach(el => el.remove());
    container.querySelectorAll('.party-tooltip').forEach(el => el.remove());
    
    // Get actual container dimensions - ensure it's properly sized
    let containerWidth = container.offsetWidth;
    let containerHeight = container.offsetHeight;
    
    // Fallback if container dimensions are not available
    if (containerWidth === 0 || containerHeight === 0) {
        containerWidth = 400;
        containerHeight = 400;
    }
    
    const padding = 50;
    
    // Create/update SVG elements
    createSVGElements(containerWidth, containerHeight, padding);
    
    const selectedParties = Array.from(document.querySelectorAll('.party-checkbox:checked'))
        .map(cb => cb.dataset.party);
    
    // Store party positions for drawing lines later
    const partyPositions = {};
    
    const usableWidth = containerWidth - (padding * 2);
    const usableHeight = containerHeight - (padding * 2);
    
    parties.forEach((party, index) => {
        if (party.seats === 0) return;
        
        // Calculate position (convert from -1,1 range to container dimensions)
        const x = padding + ((party.economic + 1) / 2) * usableWidth;
        const y = padding + ((-party.social + 1) / 2) * usableHeight;
        
        // Store position for line drawing (using same coordinate system)
        partyPositions[party.name] = { 
            x: x, 
            y: y
        };
        
        // Calculate size based on seats (50% bigger than before)
        const maxSeats = Math.max(...parties.map(p => p.seats));
        const minSize = 30;
        const maxSize = 90;
        const size = Math.max(minSize, (party.seats / maxSeats) * maxSize);
        
        // Create party circle
        const partyElement = document.createElement('div');
        partyElement.className = 'spectrum-party';
        partyElement.style.left = x + 'px';
        partyElement.style.top = y + 'px';
        partyElement.style.width = size + 'px';
        partyElement.style.height = size + 'px';
        partyElement.style.fontSize = Math.max(8, size / 6) + 'px';
        
        // Set color based on economic position
        if (selectedParties.includes(party.name)) {
            partyElement.classList.add('selected');
        } else {
            partyElement.style.backgroundColor = getPartyColor(party.economic);
        }
        
        // Set party abbreviation with better handling
        partyElement.textContent = getPartyAbbreviation(party.name);
        partyElement.dataset.party = party.name;
        
        // Add drag handlers
        partyElement.onmousedown = function(e) {
            startDrag(e, party);
        };
        
        // Add click handler for party info display
        partyElement.onclick = function(e) {
            if (!dragState.isDragging) {
                showPartyInfo(party);
                // Toggle selection if not dragging
                const checkbox = document.querySelector(`.party-checkbox[data-party="${party.name}"]`);
                if (checkbox) {
                    checkbox.checked = !checkbox.checked;
                    updateVisualization();
                }
            }
        };
        
        // Add tooltip
        const tooltip = document.createElement('div');
        tooltip.className = 'party-tooltip';
        tooltip.textContent = `${party.name} (${party.seats} seats)`;
        tooltip.style.left = x + 'px';
        tooltip.style.top = (y - size/2 - 5) + 'px';
        tooltip.style.display = 'none';
        
        partyElement.onmouseenter = function() {
            if (!dragState.isDragging) {
                tooltip.style.display = 'block';
            }
        };
        
        partyElement.onmouseleave = function() {
            tooltip.style.display = 'none';
        };
        
        container.appendChild(partyElement);
        container.appendChild(tooltip);
    });
    
    // Draw lines between selected parties
    drawCoalitionLines(selectedParties, partyPositions);
}

// Drag functionality
function startDrag(e, party) {
    dragState.isDragging = true;
    dragState.dragParty = party;
    dragState.containerRect = document.querySelector('.spectrum-container').getBoundingClientRect();
    
    const partyElement = e.target;
    partyElement.classList.add('dragging');
    
    // Hide tooltip during drag
    const tooltip = partyElement.parentElement.querySelector('.party-tooltip');
    if (tooltip) tooltip.style.display = 'none';
    
    e.preventDefault();
}

function handleMouseMove(e) {
    if (!dragState.isDragging || !dragState.dragParty) return;
    
    const container = document.querySelector('.spectrum-container');
    const containerRect = dragState.containerRect;
    const padding = 50;
    
    // Calculate mouse position relative to container
    const mouseX = e.clientX - containerRect.left;
    const mouseY = e.clientY - containerRect.top;
    
    // Constrain to container bounds
    const constrainedX = Math.max(padding, Math.min(containerRect.width - padding, mouseX));
    const constrainedY = Math.max(padding, Math.min(containerRect.height - padding, mouseY));
    
    // Update party element position immediately for visual feedback
    const partyElement = container.querySelector(`.spectrum-party[data-party="${dragState.dragParty.name}"]`);
    if (partyElement) {
        partyElement.style.left = constrainedX + 'px';
        partyElement.style.top = constrainedY + 'px';
    }
}

async function handleMouseUp(e) {
    if (!dragState.isDragging || !dragState.dragParty) return;
    
    const container = document.querySelector('.spectrum-container');
    const containerRect = dragState.containerRect;
    const padding = 50;
    
    // Calculate final position
    const mouseX = e.clientX - containerRect.left;
    const mouseY = e.clientY - containerRect.top;
    
    const constrainedX = Math.max(padding, Math.min(containerRect.width - padding, mouseX));
    const constrainedY = Math.max(padding, Math.min(containerRect.height - padding, mouseY));
    
    // Convert back to political spectrum coordinates (-1 to 1)
    const usableWidth = containerRect.width - (padding * 2);
    const usableHeight = containerRect.height - (padding * 2);
    
    const economic = ((constrainedX - padding) / usableWidth) * 2 - 1;
    const social = -(((constrainedY - padding) / usableHeight) * 2 - 1);
    
    // Update party position via API
    try {
        const response = await fetch('/api/update_position', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                party_name: dragState.dragParty.name,
                economic: economic,
                social: social
            })
        });
        
        const data = await response.json();
        if (data.success) {
            // Update local party data
            parties = data.parties;
            
            // Update all displays
            updateSpectrum();
            updateCoalitions();
            updateChart(); // Update chart colors based on new positions
            
            // Show updated party info
            const updatedParty = parties.find(p => p.name === dragState.dragParty.name);
            if (updatedParty) {
                showPartyInfo(updatedParty);
            }
        }
    } catch (error) {
        console.error('Failed to update party position:', error);
    }
    
    // Clean up drag state
    const partyElement = container.querySelector(`.spectrum-party[data-party="${dragState.dragParty.name}"]`);
    if (partyElement) {
        partyElement.classList.remove('dragging');
    }
    
    dragState.isDragging = false;
    dragState.dragParty = null;
    dragState.containerRect = null;
}

function showPartyInfo(party) {
    const infoPanel = document.getElementById('party-info');
    const nameSpan = document.getElementById('party-info-name');
    const economicSpan = document.getElementById('party-info-economic');
    const socialSpan = document.getElementById('party-info-social');
    
    nameSpan.textContent = `${party.name} (${party.seats} seats)`;
    economicSpan.textContent = party.economic.toFixed(2);
    socialSpan.textContent = party.social.toFixed(2);
    
    infoPanel.style.display = 'block';
}

function drawCoalitionLines(selectedParties, partyPositions) {
    const linesGroup = document.getElementById('coalition-lines');
    
    // Clear existing lines
    linesGroup.innerHTML = '';
    
    // Draw lines between all pairs of selected parties
    if (selectedParties.length > 1) {
        for (let i = 0; i < selectedParties.length; i++) {
            for (let j = i + 1; j < selectedParties.length; j++) {
                const party1 = selectedParties[i];
                const party2 = selectedParties[j];
                
                const pos1 = partyPositions[party1];
                const pos2 = partyPositions[party2];
                
                if (pos1 && pos2) {
                    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                    line.setAttribute('x1', pos1.x);
                    line.setAttribute('y1', pos1.y);
                    line.setAttribute('x2', pos2.x);
                    line.setAttribute('y2', pos2.y);
                    line.setAttribute('class', 'coalition-line');
                    
                    linesGroup.appendChild(line);
                }
            }
        }
    }
}

function updateVisualization() {
    const selectedParties = Array.from(document.querySelectorAll('.party-checkbox:checked'))
        .map(cb => cb.dataset.party);
    
    const coalitionSeats = parties
        .filter(p => selectedParties.includes(p.name))
        .reduce((sum, p) => sum + p.seats, 0);
    
    // Update coalition info
    const coalitionInfo = document.getElementById('coalition-info');
    if (coalitionSeats >= 76) {
        coalitionInfo.innerHTML = `<span class="text-success">Coalition seats: ${coalitionSeats} / 150 ✓ Majority</span>`;
    } else {
        const needed = 76 - coalitionSeats;
        coalitionInfo.innerHTML = `<span class="text-danger">Coalition seats: ${coalitionSeats} / 150 (${needed} more needed)</span>`;
    }
    
    // Update both views
    updateChart();
    updateSpectrum();
    
    // Update table rows
    document.querySelectorAll('#party-tbody tr').forEach((row, index) => {
        if (selectedParties.includes(parties[index].name)) {
            row.classList.add('selected-row');
        } else {
            row.classList.remove('selected-row');
        }
    });
}

// Color scale functions for coalition stats
function getEconomicColor(value) {
    // Blue (left) to Red (right)
    // -1 = blue, 0 = gray, +1 = red
    const normalized = (value + 1) / 2; // Convert from [-1,1] to [0,1]
    const r = Math.round(255 * normalized);
    const g = Math.round(150 * (1 - Math.abs(value)));
    const b = Math.round(255 * (1 - normalized));
    return `rgb(${r}, ${g}, ${b})`;
}

function getSocialColor(value) {
    // Green (progressive) to Purple (conservative)
    // +1 = green, 0 = gray, -1 = purple
    const normalized = (value + 1) / 2; // Convert from [-1,1] to [0,1]
    const r = Math.round(128 * (1 - normalized));
    const g = Math.round(255 * normalized);
    const b = Math.round(128 * (1 - normalized));
    return `rgb(${r}, ${g}, ${b})`;
}

function getCompatibilityColor(value) {
    // Red to Yellow to Green gradient
    // 0% = red, 50% = yellow, 100% = green
    const normalized = value / 100;
    const r = normalized < 0.5 ? 255 : Math.round(255 * (1 - (normalized - 0.5) * 2));
    const g = normalized < 0.5 ? Math.round(255 * normalized * 2) : 255;
    const b = 0;
    return `rgb(${r}, ${g}, ${b})`;
}

function addExclusion() {
    const party1 = document.getElementById('exclude-party1').value;
    const party2 = document.getElementById('exclude-party2').value;
    
    if (!party1) {
        alert('Please select at least one party');
        return;
    }
    
    // Allow single-party exclusions
    let exclusion;
    if (!party2) {
        // Single party exclusion
        exclusion = [party1];
    } else {
        // Two-party exclusion
        if (party1 === party2) {
            alert('Please select two different parties');
            return;
        }
        exclusion = [party1, party2].sort();
    }
    
    const exclusionStr = exclusion.join('-');
    
    if (exclusions.some(e => e.join('-') === exclusionStr)) {
        alert('This exclusion already exists');
        return;
    }
    
    if (inclusions.some(i => i.join('-') === exclusionStr)) {
        alert('These parties are already set as inclusions');
        return;
    }
    
    exclusions.push(exclusion);
    updateExclusionsDisplay();
    updateCoalitions();
    
    document.getElementById('exclude-party1').value = '';
    document.getElementById('exclude-party2').value = '';
}

function addInclusion() {
    const party1 = document.getElementById('include-party1').value;
    const party2 = document.getElementById('include-party2').value;
    
    if (!party1 || !party2) {
        alert('Please select two parties');
        return;
    }
    
    if (party1 === party2) {
        alert('Please select two different parties');
    	return;
    }
    
    const inclusion = [party1, party2].sort();
    const inclusionStr = inclusion.join('-');
    
    if (inclusions.some(i => i.join('-') === inclusionStr)) {
        alert('This inclusion already exists');
        return;
    }
    
    if (exclusions.some(e => e.join('-') === inclusionStr)) {
        alert('These parties are already set as exclusions');
        return;
    }
    
    inclusions.push(inclusion);
    updateInclusionsDisplay();
    updateCoalitions();
    
    document.getElementById('include-party1').value = '';
    document.getElementById('include-party2').value = '';
}

function updateExclusionsDisplay() {
    const container = document.getElementById('exclusions-list');
    container.innerHTML = exclusions.map((exc, index) => {
        if (exc.length === 1) {
            // Single party exclusion
            return `<span class="exclusion-item">
                🚫 ${exc[0]}
                <span class="remove-btn" onclick="removeExclusion(${index})">×</span>
            </span>`;
        } else {
            // Two party exclusion
            return `<span class="exclusion-item">
                ❌ ${exc[0]} ↔ ${exc[1]}
                <span class="remove-btn" onclick="removeExclusion(${index})">×</span>
            </span>`;
        }
    }).join('');
}

function updateInclusionsDisplay() {
    const container = document.getElementById('inclusions-list');
    container.innerHTML = inclusions.map((inc, index) => 
        `<span class="inclusion-item">
            ✅ ${inc[0]} ↔ ${inc[1]}
            <span class="remove-btn" onclick="removeInclusion(${index})">×</span>
        </span>`
    ).join('');
}

function removeExclusion(index) {
    exclusions.splice(index, 1);
    updateExclusionsDisplay();
    updateCoalitions();
}

function removeInclusion(index) {
    inclusions.splice(index, 1);
    updateInclusionsDisplay();
    updateCoalitions();
}

async function updateCoalitions() {
    const minParties = parseInt(document.getElementById('min-parties').value);
    const maxParties = parseInt(document.getElementById('max-parties').value);
    
    if (minParties > maxParties) {
        alert('Minimum parties cannot be greater than maximum parties');
        document.getElementById('min-parties').value = maxParties;
        return;
    }
    
    try {
        const response = await fetch('/api/coalitions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                min_parties: minParties,
                max_parties: maxParties,
                exclusions: exclusions,
                inclusions: inclusions
            })
        });
        
        const data = await response.json();
        displayCoalitions(data.coalitions);
        document.getElementById('coalition-count').textContent = data.total_count;
        
    } catch (error) {
        console.error('Failed to update coalitions:', error);
    }
}

function displayCoalitions(coalitions) {
    const tbody = document.getElementById('coalition-tbody');
    tbody.innerHTML = '';
    
    coalitions.forEach((coalition, index) => {
        const row = tbody.insertRow();
        
        // Format the stats with color coding
        const leftCell = `<td class="stat-cell economic-score" style="background-color: ${getEconomicColor(coalition.avg_economic)}">${coalition.avg_economic.toFixed(2)}</td>`;
        const progCell = `<td class="stat-cell social-score" style="background-color: ${getSocialColor(coalition.avg_social)}">${coalition.avg_social.toFixed(2)}</td>`;
        const compCell = `<td class="stat-cell compatibility-score" style="background-color: ${getCompatibilityColor(coalition.compatibility)}">${coalition.compatibility.toFixed(1)}%</td>`;
        
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${coalition.seats}</td>
            ${leftCell}
            ${progCell}
            ${compCell}
            <td>${coalition.parties.join(', ')}</td>
        `;
        row.onclick = () => selectCoalition(coalition.parties, row);
    });
}

async function selectCoalition(coalitionParties, row) {
    // Clear all checkboxes
    document.querySelectorAll('.party-checkbox').forEach(cb => cb.checked = false);
    
    // Check parties in the coalition
    coalitionParties.forEach(partyName => {
        const checkbox = document.querySelector(`.party-checkbox[data-party="${partyName}"]`);
        if (checkbox) checkbox.checked = true;
    });
    
    // Update visual selection
    document.querySelectorAll('#coalition-tbody tr').forEach(r => r.classList.remove('coalition-selected'));
    row.classList.add('coalition-selected');
    
    updateVisualization();
    
    // Update server state
    await fetch('/api/select_coalition', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            parties: coalitionParties
        })
    });
}