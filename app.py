from flask import Flask, render_template, jsonify, request
import json
from models.coalition import Coalition, Party
from scrapers.polling import PollingScraper

app = Flask(__name__)

# Global variable to store coalition data
coalition_data = None

@app.route('/')
def index():
    """Render the main page."""
    return render_template('index.html')

@app.route('/api/initialize')
def initialize():
    """Initialize the application with polling data."""
    global coalition_data
    
    try:
        # Fetch polling data
        scraper = PollingScraper()
        parties = scraper.get_latest_polls()
        
        if not parties:
            return jsonify({'error': 'No party data found'}), 500
        
        # Create coalition model
        coalition_data = Coalition(parties)
        
        # Return party data with spectrum positions
        party_list = [{
            'name': p.name, 
            'seats': p.seats,
            'economic': p.economic,
            'social': p.social
        } for p in parties]
        
        return jsonify({
            'success': True,
            'parties': party_list,
            'total_seats': coalition_data.get_total_seats()
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/update_position', methods=['POST'])
def update_position():
    """Update a party's political spectrum position."""
    global coalition_data
    
    if not coalition_data:
        return jsonify({'error': 'Not initialized'}), 400
    
    data = request.json
    party_name = data.get('party_name')
    economic = data.get('economic')
    social = data.get('social')
    
    if not party_name or economic is None or social is None:
        return jsonify({'error': 'Missing required parameters'}), 400
    
    # Update position
    coalition_data.update_party_position(party_name, economic, social)
    
    # Return updated party data
    party_list = [{
        'name': p.name, 
        'seats': p.seats,
        'economic': p.economic,
        'social': p.social
    } for p in coalition_data.parties]
    
    return jsonify({
        'success': True,
        'parties': party_list
    })

@app.route('/api/coalitions', methods=['POST'])
def generate_coalitions():
    """Generate possible coalitions based on constraints."""
    global coalition_data
    
    if not coalition_data:
        return jsonify({'error': 'Not initialized'}), 400
    
    data = request.json
    
    # Parse constraints
    min_parties = data.get('min_parties', 1)
    max_parties = data.get('max_parties', 6)
    exclusions = set(tuple(e) for e in data.get('exclusions', []))
    inclusions = set(tuple(i) for i in data.get('inclusions', []))
    
    # Generate coalitions
    possible_coalitions = coalition_data.generate_all_coalitions(
        exclusions=exclusions,
        inclusions=inclusions,
        min_parties=min_parties,
        max_parties=max_parties
    )
    
    # Format for JSON with new statistics
    coalitions_list = []
    for parties, total_seats in possible_coalitions:
        # Calculate average positions
        avg_economic = sum(p.economic for p in parties) / len(parties)
        avg_social = sum(p.social for p in parties) / len(parties)
        
        # Calculate compatibility
        compatibility = coalition_data.calculate_compatibility(parties)
        
        coalition_dict = {
            'parties': [p.name for p in parties],
            'seats': total_seats,
            'party_details': [{'name': p.name, 'seats': p.seats} for p in parties],
            'avg_economic': avg_economic,
            'avg_social': avg_social,
            'compatibility': compatibility
        }
        coalitions_list.append(coalition_dict)
    
    # Sort by compatibility (highest first)
    coalitions_list.sort(key=lambda x: x['compatibility'], reverse=True)
    
    return jsonify({
        'coalitions': coalitions_list,
        'total_count': len(coalitions_list)
    })

@app.route('/api/select_coalition', methods=['POST'])
def select_coalition():
    """Update selected parties based on coalition selection."""
    global coalition_data
    
    if not coalition_data:
        return jsonify({'error': 'Not initialized'}), 400
    
    data = request.json
    selected_parties = data.get('parties', [])
    
    # Clear all selections
    for party in coalition_data.parties:
        party.selected = False
    
    # Select specified parties
    for party_name in selected_parties:
        for party in coalition_data.parties:
            if party.name == party_name:
                party.selected = True
                break
    
    # Return updated state
    return jsonify({
        'coalition_seats': coalition_data.get_coalition_seats(),
        'has_majority': coalition_data.has_majority()
    })

if __name__ == '__main__':
    app.run(debug=True)