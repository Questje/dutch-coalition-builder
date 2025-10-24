from dataclasses import dataclass
from typing import List, Tuple, Set, Dict
from itertools import combinations
import math
import json
import os

@dataclass
class Party:
    """Represents a political party with its seat count and political spectrum position."""
    name: str
    seats: int
    selected: bool = False
    economic: float = 0.0  # -1 (left-wing) to 1 (right-wing)
    social: float = 0.0    # -1 (conservative) to 1 (progressive)
    
    def __hash__(self):
        return hash(self.name)
    
    def __eq__(self, other):
        if isinstance(other, Party):
            return self.name == other.name
        return False

class Coalition:
    """Manages coalition building logic."""
    
    # Default political spectrum positions for Dutch parties
    DEFAULT_PARTY_POSITIONS = {
        'PVV': {'economic': 0.3, 'social': -0.8},      # Right-wing populist, conservative
        'VVD': {'economic': 0.7, 'social': 0.3},       # Liberal, economically right, socially progressive
        'CDA': {'economic': 0.2, 'social': -0.4},      # Christian democrats, center-right, conservative
        'D66': {'economic': -0.1, 'social': 0.8},      # Liberal democrats, center-left, progressive
        'GL': {'economic': -0.7, 'social': 0.9},       # Green party, left-wing, progressive
        'PvdA': {'economic': -0.6, 'social': 0.6},     # Social democrats, left-wing, progressive
        'SP': {'economic': -0.8, 'social': -0.1},      # Socialist party, left-wing, mixed social
        'PvdD': {'economic': -0.5, 'social': 0.7},     # Animal rights, left-wing, progressive
        'CU': {'economic': -0.1, 'social': -0.6},      # Christian union, center, conservative
        'SGP': {'economic': 0.1, 'social': -0.9},      # Reformed political party, conservative
        'DENK': {'economic': -0.4, 'social': -0.3},    # Immigrant party, left-wing economics, mixed social
        'FvD': {'economic': 0.5, 'social': -0.7},      # Forum for Democracy, right-wing, conservative
        'JA21': {'economic': 0.6, 'social': -0.2},     # Right-wing liberal, conservative-leaning
        'Volt': {'economic': -0.2, 'social': 0.9},     # Pro-European, center-left, progressive
        'BBB': {'economic': 0.4, 'social': -0.2},      # Farmer party, right-wing, conservative-leaning
        'NSC': {'economic': 0.3, 'social': 0.1},       # New Social Contract, center-right, moderate
        'BVNL': {'economic': 0.8, 'social': -0.5},     # Belang van Nederland, right-wing, conservative
        'Lijst Pim Fortuyn': {'economic': 0.4, 'social': -0.4},  # Legacy positioning
        'OSF': {'economic': -0.3, 'social': 0.4},      # Omtzigt party, center-left, moderate progressive
    }
    
    POSITIONS_FILE = 'party_positions.json'
    
    def __init__(self, parties: List[Party]):
        self.parties = self._assign_spectrum_positions(parties)
        self.majority_threshold = 76
        
    def _assign_spectrum_positions(self, parties: List[Party]) -> List[Party]:
        """Assign political spectrum positions to parties."""
        # Load custom positions if available
        positions = self._load_positions()
        
        for party in parties:
            if party.name in positions:
                party.economic = positions[party.name]['economic']
                party.social = positions[party.name]['social']
            # If party not in positions, keep default (0, 0)
        return parties
    
    def _load_positions(self) -> Dict:
        """Load party positions from JSON file, fall back to defaults."""
        if os.path.exists(self.POSITIONS_FILE):
            try:
                with open(self.POSITIONS_FILE, 'r') as f:
                    saved_positions = json.load(f)
                    # Merge with defaults to ensure all parties have positions
                    positions = self.DEFAULT_PARTY_POSITIONS.copy()
                    positions.update(saved_positions)
                    return positions
            except (json.JSONDecodeError, IOError):
                pass
        
        return self.DEFAULT_PARTY_POSITIONS.copy()
    
    def save_positions(self):
        """Save current party positions to JSON file."""
        positions = {}
        for party in self.parties:
            positions[party.name] = {
                'economic': party.economic,
                'social': party.social
            }
        
        try:
            with open(self.POSITIONS_FILE, 'w') as f:
                json.dump(positions, f, indent=2)
            return True
        except IOError:
            return False
    
    def update_party_position(self, party_name: str, economic: float, social: float):
        """Update a party's position and save to file."""
        # Clamp values to valid range [-1, 1]
        economic = max(-1, min(1, economic))
        social = max(-1, min(1, social))
        
        for party in self.parties:
            if party.name == party_name:
                party.economic = economic
                party.social = social
                break
        
        self.save_positions()
        
    def get_total_seats(self) -> int:
        """Calculate total seats across all parties."""
        return sum(party.seats for party in self.parties)
    
    def get_coalition_seats(self) -> int:
        """Calculate seats for selected coalition parties."""
        return sum(party.seats for party in self.parties if party.selected)
    
    def has_majority(self) -> bool:
        """Check if coalition has majority."""
        return self.get_coalition_seats() >= self.majority_threshold
    
    def toggle_party(self, party_name: str):
        """Toggle party selection for coalition."""
        for party in self.parties:
            if party.name == party_name:
                party.selected = not party.selected
                break
    
    def get_selected_parties(self) -> List[Party]:
        """Get list of selected parties."""
        return [p for p in self.parties if p.selected]
    
    def calculate_compatibility(self, parties: List[Party]) -> float:
        """
        Calculate compatibility score for a coalition using convex hull area method.
        
        This method:
        1. Calculates the convex hull (smallest polygon containing all parties)
        2. Measures the area of this polygon
        3. Smaller area = higher compatibility
        4. Light penalty for party count (2% per additional party beyond 2)
        
        Returns: Compatibility percentage (0-100)
        """
        if len(parties) <= 1:
            return 100.0
        
        if len(parties) == 2:
            # For 2 parties, use simple distance
            economic_diff = parties[0].economic - parties[1].economic
            social_diff = parties[0].social - parties[1].social
            distance = math.sqrt(economic_diff**2 + social_diff**2)
            max_distance = math.sqrt(8)
            return round((1 - distance / max_distance) * 100, 1)
        
        # Get party positions
        points = [(p.economic, p.social) for p in parties]
        
        # Calculate convex hull using Graham scan algorithm
        def cross_product(o, a, b):
            return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
        
        # Sort points lexicographically
        points = sorted(set(points))
        
        if len(points) <= 2:
            # Collinear or duplicate points
            economic_diff = max(p.economic for p in parties) - min(p.economic for p in parties)
            social_diff = max(p.social for p in parties) - min(p.social for p in parties)
            spread = math.sqrt(economic_diff**2 + social_diff**2)
            max_spread = math.sqrt(8)
            return round((1 - spread / max_spread) * 100 * 0.98 ** (len(parties) - 2), 1)
        
        # Build lower hull
        lower = []
        for p in points:
            while len(lower) >= 2 and cross_product(lower[-2], lower[-1], p) <= 0:
                lower.pop()
            lower.append(p)
        
        # Build upper hull
        upper = []
        for p in reversed(points):
            while len(upper) >= 2 and cross_product(upper[-2], upper[-1], p) <= 0:
                upper.pop()
            upper.append(p)
        
        # Remove last point of each half because it's repeated
        hull = lower[:-1] + upper[:-1]
        
        # Calculate area using shoelace formula
        area = 0
        for i in range(len(hull)):
            j = (i + 1) % len(hull)
            area += hull[i][0] * hull[j][1]
            area -= hull[j][0] * hull[i][1]
        area = abs(area) / 2.0
        
        # Maximum possible area is 4 (rectangle from -1,-1 to 1,1)
        max_area = 4.0
        
        # Base compatibility inversely proportional to area
        base_compatibility = (1 - area / max_area) * 100
        
        # Light party count penalty - 2% per additional party beyond 2
        party_count_penalty = 0.98 ** (len(parties) - 2)
        
        final_compatibility = base_compatibility * party_count_penalty
        
        return round(max(0, final_compatibility), 1)
    
    def contains_excluded_pair(self, parties: List[Party], exclusions: Set[Tuple[str, ...]]) -> bool:
        """
        Check if a coalition contains any excluded party pair or single excluded party.
        
        Exclusions can be:
        - Single party tuple: (party_name,) - party cannot be in any coalition
        - Two party tuple: (party1, party2) - these two parties cannot be together
        """
        party_names = [p.name for p in parties]
        
        for exclusion in exclusions:
            if len(exclusion) == 1:
                # Single party exclusion - party cannot be in any coalition
                if exclusion[0] in party_names:
                    return True
            elif len(exclusion) == 2:
                # Two party exclusion - both parties cannot be together
                if exclusion[0] in party_names and exclusion[1] in party_names:
                    return True
        
        return False
    
    def violates_inclusions(self, parties: List[Party], inclusions: Set[Tuple[str, str]]) -> bool:
        """Check if a coalition violates inclusion rules."""
        party_names = [p.name for p in parties]
        
        for inclusion in inclusions:
            party1_in = inclusion[0] in party_names
            party2_in = inclusion[1] in party_names
            
            if party1_in != party2_in:
                return True
        
        return False
    
    def generate_all_coalitions(self, 
                               exclusions: Set[Tuple[str, ...]] = None,
                               inclusions: Set[Tuple[str, str]] = None,
                               min_parties: int = 1,
                               max_parties: int = 6) -> List[Tuple[List[Party], int]]:
        """Generate all possible coalitions with constraints."""
        if exclusions is None:
            exclusions = set()
        if inclusions is None:
            inclusions = set()
        
        possible_coalitions = []
        viable_parties = [p for p in self.parties if p.seats > 0]
        
        for size in range(min_parties, min(max_parties + 1, len(viable_parties) + 1)):
            for combo in combinations(viable_parties, size):
                if self.contains_excluded_pair(combo, exclusions):
                    continue
                
                if self.violates_inclusions(combo, inclusions):
                    continue
                
                total_seats = sum(party.seats for party in combo)
                
                if total_seats >= self.majority_threshold:
                    sorted_combo = sorted(combo, key=lambda p: p.seats, reverse=True)
                    possible_coalitions.append((sorted_combo, total_seats))
        
        possible_coalitions.sort(key=lambda x: (x[0][0].seats, x[1]), reverse=True)
        
        return possible_coalitions